import bcrypt from 'bcrypt';
import User from '../models/User.js';
import ApiResponse from '../utils/apiResponse.js';
import generateAccessToken, { generateRefreshTokenPayload } from '../utils/generateToken.js';
import RefreshToken from '../models/RefreshToken.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validations/authValidation.js';
import TwoFactorService from '../services/twoFactorService.js';
import { sendSMS, validatePhoneNumber, generateVerificationCode } from '../utils/smsUtils.js';
import mailer from '../services/email.Service.js';
import crypto from 'crypto';
import { resetPasswordEmail } from '../templates/resetPasswordEmail.js';

const authController = {
  register: async (req, res) => {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    const { username, email, password, role } = value;

    try {
      // Check if email already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (existingUser) {
        if (existingUser.email === email) {
          return ApiResponse.error(res, 'errors.EMAIL_EXISTS', 400);
        }
        if (existingUser.username === username) {
          return ApiResponse.error(res, 'errors.USERNAME_EXISTS', 400);
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new user
      const user = new User({
        username,
        email,
        password: hashedPassword,
        role,
      });

      await user.save();

      // Prepare user data to return (exclude password)
      const { _id, username: userName, email: userEmail, role: userRole } = user;
      const resUser = {
        id: _id,
        username: userName,
        email: userEmail,
        role: userRole,
      };

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const { payload: rtPayload, expiresAt } = generateRefreshTokenPayload(user);
      const rawRefreshToken = crypto.randomBytes(48).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

      await RefreshToken.create({
        userId: user._id,
        tokenHash,
        expiresAt,
        createdByIp: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      return ApiResponse.success(res, { user: resUser, accessToken, refreshToken: rawRefreshToken }, 'User registered successfully', 201);
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  logout: async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return ApiResponse.error(res, 'Refresh token required', 400);
      }

      const presentedHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const existing = await RefreshToken.findOne({ tokenHash: presentedHash });

      if (existing) {
        existing.revokedAt = new Date();
        existing.revokedByIp = req.ip;
        await existing.save();
      }

      return ApiResponse.success(res, { revoked: true }, 'Logged out');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  refresh: async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return ApiResponse.error(res, 'Refresh token required', 400);
      }

      const presentedHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const existing = await RefreshToken.findOne({ tokenHash: presentedHash });
      if (!existing) {
        return ApiResponse.error(res, 'Invalid refresh token', 401);
      }

      if (existing.revokedAt || existing.expiresAt <= new Date()) {
        return ApiResponse.error(res, 'Refresh token expired or revoked', 401);
      }

      const user = await User.findById(existing.userId);
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Rotate token: revoke old and issue new
      const newRawRefresh = crypto.randomBytes(48).toString('hex');
      const newHash = crypto.createHash('sha256').update(newRawRefresh).digest('hex');
      const { expiresAt } = generateRefreshTokenPayload(user);

      existing.revokedAt = new Date();
      existing.revokedByIp = req.ip;
      existing.replacedByTokenHash = newHash;
      await existing.save();

      await RefreshToken.create({
        userId: user._id,
        tokenHash: newHash,
        expiresAt,
        createdByIp: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      const accessToken = generateAccessToken(user);
      return ApiResponse.success(res, { accessToken, refreshToken: newRawRefresh }, 'Token refreshed');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  login: async (req, res) => {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    const { email, password } = value;

    try {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Prepare user data to return (exclude password)
      const { _id, username, email: userEmail, role } = user;
      const resUser = {
        id: _id,
        username,
        email: userEmail,
        role,
      };

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const { payload: rtPayload, expiresAt } = generateRefreshTokenPayload(user);
      const rawRefreshToken = crypto.randomBytes(48).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

      await RefreshToken.create({
        userId: user._id,
        tokenHash,
        expiresAt,
        createdByIp: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      return ApiResponse.success(res, { user: resUser, accessToken, refreshToken: rawRefreshToken }, 'Login successful');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Enable SMS-based 2FA
  enableSMS2FA: async (req, res) => {
    const { phoneNumber } = req.body;

    if (!validatePhoneNumber(phoneNumber)) {
      return ApiResponse.error(res, 'Invalid phone number format', 400);
    }

    try {
      const user = await User.findById(req.user.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      // Generate verification code
      const verificationCode = generateVerificationCode();

      // Temporarily store the verification code (in real app, use Redis or similar)
      user.twoFactorAuth.methods.sms.phoneNumber = phoneNumber;
      user.twoFactorAuth.methods.sms.verificationCode = verificationCode;
      user.twoFactorAuth.methods.sms.verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await user.save();

      // Send SMS verification code
      await sendSMS(phoneNumber, `Your Uzima 2FA verification code is: ${verificationCode}`);

      return ApiResponse.success(
        res,
        { message: 'Verification code sent to your phone' },
        'SMS 2FA setup initiated'
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Verify SMS 2FA setup
  verifySMS2FA: async (req, res) => {
    const { code } = req.body;

    try {
      const user = await User.findById(req.user.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      const smsConfig = user.twoFactorAuth.methods.sms;

      if (!smsConfig.verificationCode || smsConfig.verificationExpiry < new Date()) {
        return ApiResponse.error(res, 'Verification code expired or not found', 400);
      }

      if (smsConfig.verificationCode !== code) {
        return ApiResponse.error(res, 'Invalid verification code', 400);
      }

      // Enable SMS 2FA
      smsConfig.enabled = true;
      smsConfig.verified = true;
      smsConfig.verificationCode = undefined;
      smsConfig.verificationExpiry = undefined;
      user.twoFactorAuth.isEnabled = true;

      await user.save();

      return ApiResponse.success(
        res,
        { twoFactorAuth: { sms: { enabled: true, phoneNumber: smsConfig.phoneNumber } } },
        'SMS 2FA enabled successfully'
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Enable TOTP-based 2FA
  enableTOTP2FA: async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      // Generate TOTP secret
      const secret = TwoFactorService.generateTOTPSecret();
      const qrCodeURI = TwoFactorService.generateQRCodeURI(user.email, secret);

      // Generate backup codes
      const backupCodes = TwoFactorService.generateBackupCodes();

      // Temporarily store secret (not enabled until verified)
      user.twoFactorAuth.methods.totp.secret = secret;
      user.twoFactorAuth.methods.totp.backupCodes = backupCodes;

      await user.save();

      // Send setup email
      await TwoFactorService.sendTOTPSetupEmail(user.email, secret);

      return ApiResponse.success(
        res,
        {
          qrCodeURI,
          secret,
          backupCodes: backupCodes.map(bc => bc.code),
        },
        'TOTP 2FA setup initiated'
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Verify TOTP 2FA setup
  verifyTOTP2FA: async (req, res) => {
    const { code } = req.body;

    try {
      const user = await User.findById(req.user.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      const totpConfig = user.twoFactorAuth.methods.totp;

      if (!totpConfig.secret) {
        return ApiResponse.error(res, 'TOTP not configured', 400);
      }

      // Verify TOTP code
      const isValid = TwoFactorService.verifyTOTP(totpConfig.secret, code);

      if (!isValid) {
        return ApiResponse.error(res, 'Invalid TOTP code', 400);
      }

      // Enable TOTP 2FA
      totpConfig.enabled = true;
      totpConfig.verified = true;
      user.twoFactorAuth.isEnabled = true;

      await user.save();

      return ApiResponse.success(
        res,
        { twoFactorAuth: { totp: { enabled: true } } },
        'TOTP 2FA enabled successfully'
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Login with 2FA verification
  loginWith2FA: async (req, res) => {
    const { email, password, twoFactorCode, method, deviceId, rememberDevice } = req.body;

    try {
      // First verify credentials
      const user = await User.findOne({ email });
      if (!user) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Check if 2FA is enabled
      if (!user.twoFactorAuth.isEnabled) {
        return ApiResponse.error(res, '2FA not enabled for this account', 400);
      }

      // Check if device is trusted
      if (deviceId && (await TwoFactorService.isDeviceTrusted(user._id, deviceId))) {
        const accessToken = generateAccessToken(user);
        const { expiresAt } = generateRefreshTokenPayload(user);
        const rawRefreshToken = crypto.randomBytes(48).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        await RefreshToken.create({
          userId: user._id,
          tokenHash,
          expiresAt,
          createdByIp: req.ip,
          userAgent: req.get('User-Agent') || null,
        });
        return ApiResponse.success(
          res,
          {
            user: {
              id: user._id,
              username: user.username,
              email: user.email,
              role: user.role,
            },
            accessToken,
            refreshToken: rawRefreshToken,
          },
          'Login successful (trusted device)'
        );
      }

      // Verify 2FA code
      let isValid = false;

      if (method === 'sms' && user.twoFactorAuth.methods.sms.enabled) {
        // For SMS, you would typically send a code and verify it
        // This is a simplified version
        isValid = twoFactorCode === '123456'; // Placeholder
      } else if (method === 'totp' && user.twoFactorAuth.methods.totp.enabled) {
        isValid = TwoFactorService.verifyTOTP(
          user.twoFactorAuth.methods.totp.secret,
          twoFactorCode
        );
      } else if (method === 'backup') {
        // Check backup codes
        const backupCode = user.twoFactorAuth.methods.totp.backupCodes.find(
          bc => bc.code === twoFactorCode && !bc.used
        );
        if (backupCode) {
          backupCode.used = true;
          backupCode.usedAt = new Date();
          await user.save();
          isValid = true;
        }
      }

      if (!isValid) {
        return ApiResponse.error(res, 'Invalid 2FA code', 401);
      }

      // Generate token
      const accessToken = generateAccessToken(user);
      const { expiresAt } = generateRefreshTokenPayload(user);
      const rawRefreshToken = crypto.randomBytes(48).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

      await RefreshToken.create({
        userId: user._id,
        tokenHash,
        expiresAt,
        createdByIp: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      // Add trusted device if requested
      let newDeviceId = deviceId;
      if (rememberDevice) {
        const userAgent = req.get('User-Agent') || 'Unknown';
        const ipAddress = req.ip || req.connection.remoteAddress;
        newDeviceId = await TwoFactorService.addTrustedDevice(
          user._id,
          'Web Browser',
          ipAddress,
          userAgent
        );
      }

      return ApiResponse.success(
        res,
        {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
          },
          accessToken,
          refreshToken: rawRefreshToken,
          deviceId: newDeviceId,
        },
        'Login successful'
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Get 2FA status
  get2FAStatus: async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('twoFactorAuth');
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      const status = {
        isEnabled: user.twoFactorAuth.isEnabled,
        methods: {
          sms: {
            enabled: user.twoFactorAuth.methods.sms.enabled,
            phoneNumber: user.twoFactorAuth.methods.sms.phoneNumber
              ? user.twoFactorAuth.methods.sms.phoneNumber.replace(/\d(?=\d{4})/g, '*')
              : null,
          },
          totp: {
            enabled: user.twoFactorAuth.methods.totp.enabled,
          },
        },
        trustedDevices: user.twoFactorAuth.trustedDevices.filter(
          d => !d.revoked && d.expiresAt > new Date()
        ).length,
      };

      return ApiResponse.success(res, status, '2FA status retrieved');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Disable 2FA
  disable2FA: async (req, res) => {
    const { password, twoFactorCode, method } = req.body;

    try {
      const user = await User.findById(req.user.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid password', 401);
      }

      // Verify 2FA code before disabling
      let isValid = false;
      if (method === 'totp' && user.twoFactorAuth.methods.totp.enabled) {
        isValid = TwoFactorService.verifyTOTP(
          user.twoFactorAuth.methods.totp.secret,
          twoFactorCode
        );
      } else if (method === 'backup') {
        const backupCode = user.twoFactorAuth.methods.totp.backupCodes.find(
          bc => bc.code === twoFactorCode && !bc.used
        );
        if (backupCode) {
          isValid = true;
        }
      }

      if (!isValid) {
        return ApiResponse.error(res, 'Invalid 2FA code', 401);
      }

      // Disable 2FA
      user.twoFactorAuth.isEnabled = false;
      user.twoFactorAuth.methods.sms.enabled = false;
      user.twoFactorAuth.methods.totp.enabled = false;
      user.twoFactorAuth.methods.totp.secret = undefined;
      user.twoFactorAuth.methods.totp.backupCodes = [];
      user.twoFactorAuth.trustedDevices = [];

      await user.save();

      return ApiResponse.success(res, null, '2FA disabled successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Revoke trusted device
  revokeTrustedDevice: async (req, res) => {
    const { deviceId } = req.params;

    try {
      await TwoFactorService.revokeTrustedDevice(req.user.id, deviceId);
      return ApiResponse.success(res, null, 'Device revoked successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Forgot password
  forgotPassword: async (req, res) => {
    const { error, value } = forgotPasswordSchema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    try {
      const user = await User.findOne({ email: value.email });

      // This is to prevent user enumeration
      if (!user) {
        return ApiResponse.success(
          res,
          'If an account with that email exists, a password reset link has been sent',
          200
        );
      }

      const resetToken = user.createResetPasswordToken();

      await user.save({ validateBeforeSave: false });

      const resetUrl = `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`;

      try {
        await mailer.sendMail(
          user.email,
          'Reset Password (valid 15mins)',
          resetPasswordEmail(resetUrl)
        );

        return ApiResponse.success(
          res,
          'If an account with that email exists, a password reset link has been sent',
          200
        );
      } catch (error) {
        user.security.passwordResetToken = undefined;
        user.security.passwordResetTokenExpires = undefined;
        await user.save({ validateBeforeSave: false });

        return ApiResponse.error(res, 'An error occurred processing your request', 500);
      }
    } catch (error) {
      return ApiResponse.error(res, 'An error occurred processing your request', 500);
    }
  },

  // Reset Password
  resetPassword: async (req, res) => {
    const { error, value } = resetPasswordSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    try {
      const { password } = value;

      const resetPasswordHash = crypto.createHash('sha256').update(req.params.token).digest('hex');

      const user = await User.findOne({
        'security.passwordResetToken': resetPasswordHash,
        'security.passwordResetTokenExpires': { $gt: new Date() },
      });

      if (!user) {
        return ApiResponse.error(res, 'Token is invalid or has expired', 400);
      }

      // Check if new password is different from current password
      const isSamePassword = await bcrypt.compare(password, user.password);
      if (isSamePassword) {
        return ApiResponse.error(res, 'New password must be different from current password', 400);
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
      user.security.passwordResetToken = undefined;
      user.security.passwordResetTokenExpires = undefined;
      user.security.passwordChangedAt = new Date();

      await user.save();

      return ApiResponse.success(res, 'Password reset successful', 200);
    } catch (error) {
      return ApiResponse.error(res, 'An error occurred processing your request', 500);
    }
  },
};

export default authController;
