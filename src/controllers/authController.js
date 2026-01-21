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
  verifyTOTP2FASchema,
  disable2FASchema,
  loginWith2FASchema,
} from '../validations/authValidation.js';
import mailer from '../services/email.Service.js';
import crypto from 'crypto';
import { resetPasswordEmail } from '../templates/resetPasswordEmail.js';
import * as twoFactorService from '../services/twoFactorService.js';
import jwt from 'jsonwebtoken';

const authController = {
  register: async (req, res) => {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      ApiResponse.error(res, errors, 400); // Throws error - no return needed
    }

    const { username, email, password, role } = value;

    // Check if email already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        ApiResponse.error(res, 'errors.EMAIL_EXISTS', 400); // Throws error
      }
      if (existingUser.username === username) {
        ApiResponse.error(res, 'errors.USERNAME_EXISTS', 400); // Throws error
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

  loginWith2FA: async (req, res) => {
    const { error, value } = loginWith2FASchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    const { email, password, twoFactorCode, method } = value;

    try {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Check if 2FA is enabled
      if (!user.twoFactor?.enabled) {
        return ApiResponse.error(res, '2FA is not enabled for this account', 400);
      }

      // Verify 2FA code based on method
      let verified = false;

      if (method === 'totp') {
        // Decrypt secret and verify TOTP
        const decryptedSecret = twoFactorService.decryptSecret(user.twoFactor.secret);
        verified = twoFactorService.verifyToken(decryptedSecret, twoFactorCode);
      } else if (method === 'backup') {
        // Check backup codes
        for (const backupCode of user.twoFactor.backupCodes) {
          if (backupCode.usedAt) continue; // Skip used codes

          const isValid = await twoFactorService.verifyBackupCode(twoFactorCode, backupCode.code);
          if (isValid) {
            // Mark backup code as used
            backupCode.usedAt = new Date();
            await user.save();
            verified = true;
            break;
          }
        }
      }

      if (!verified) {
        return ApiResponse.error(res, 'Invalid 2FA code', 401);
      }

      // Generate tokens with 2FA verified claim
      const accessToken = generateAccessToken(user, true); // true = twoFactorVerified
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

      // Prepare user data
      const { _id, username, email: userEmail, role } = user;
      const resUser = {
        id: _id,
        username,
        email: userEmail,
        role,
      };

      return ApiResponse.success(
        res,
        { user: resUser, accessToken, refreshToken: rawRefreshToken },
        'Login successful',
        200
      );
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

      // Check if 2FA is enabled
      if (user.twoFactor?.enabled) {
        // Return indication that 2FA is required
        return ApiResponse.success(
          res,
          {
            require2FA: true,
            message: 'Please provide your 2FA code',
          },
          'Two-factor authentication required',
          200
        );
      }

      // Prepare user data to return (exclude password)
      const { _id, username, email: userEmail, role } = user;
      const resUser = {
        id: _id,
        username,
        email: userEmail,
        role,
      };

      // Generate tokens (2FA not verified since not enabled)
      const accessToken = generateAccessToken(user, false);
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

  // 2FA methods
  enableSMS2FA: async (req, res) => {
    return ApiResponse.error(res, 'SMS 2FA not implemented yet', 501);
  },
  verifySMS2FA: async (req, res) => {
    return ApiResponse.error(res, 'SMS 2FA not implemented yet', 501);
  },
  enableTOTP2FA: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const user = await User.findById(userId);

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      if (user.twoFactor?.enabled) {
        return ApiResponse.error(res, '2FA is already enabled', 400);
      }

      // Generate TOTP secret
      const { secret, otpauthUrl } = twoFactorService.generateSecret();

      // Generate QR code
      const qrCode = await twoFactorService.generateQRCode(secret, user.email);

      // Encrypt and store secret (but don't enable yet)
      const encryptedSecret = twoFactorService.encryptSecret(secret);
      user.twoFactor = {
        enabled: false, // Not enabled until verified
        secret: encryptedSecret,
        algorithm: 'sha1',
        encoding: 'base32',
        backupCodes: [],
      };

      await user.save();

      return ApiResponse.success(
        res,
        {
          secret, // Return plaintext secret for manual entry
          qrCode, // Return QR code data URL
          message: 'Scan the QR code with your authenticator app and verify to enable 2FA',
        },
        'TOTP secret generated',
        200
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },
  verifyTOTP2FA: async (req, res) => {
    const { error, value } = verifyTOTP2FASchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    const { token } = value;

    try {
      const userId = req.user.id || req.user._id;
      const user = await User.findById(userId);

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      if (user.twoFactor?.enabled) {
        return ApiResponse.error(res, '2FA is already enabled', 400);
      }

      if (!user.twoFactor?.secret) {
        return ApiResponse.error(res, 'Please enable 2FA first', 400);
      }

      // Decrypt secret and verify token
      const decryptedSecret = twoFactorService.decryptSecret(user.twoFactor.secret);
      const verified = twoFactorService.verifyToken(decryptedSecret, token);

      if (!verified) {
        return ApiResponse.error(res, 'Invalid TOTP token', 401);
      }

      // Generate backup codes
      const backupCodes = twoFactorService.generateBackupCodes();
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(async code => ({
          code: await twoFactorService.hashBackupCode(code),
          usedAt: null,
          createdAt: new Date(),
        }))
      );

      // Enable 2FA
      user.twoFactor.enabled = true;
      user.twoFactor.verifiedAt = new Date();
      user.twoFactor.backupCodes = hashedBackupCodes;

      await user.save();

      return ApiResponse.success(
        res,
        {
          success: true,
          backupCodes, // Return plaintext backup codes (only shown once)
          message:
            'Two-factor authentication enabled successfully. Save your backup codes in a secure location.',
        },
        '2FA enabled',
        200
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },
  get2FAStatus: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const user = await User.findById(userId).select('twoFactor');

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(
        res,
        {
          enabled: user.twoFactor?.enabled || false,
          verifiedAt: user.twoFactor?.verifiedAt || null,
          backupCodesCount: user.twoFactor?.backupCodes?.filter(bc => !bc.usedAt).length || 0,
        },
        '2FA status'
      );
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },
  disable2FA: async (req, res) => {
    const { error, value } = disable2FASchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(e => e.message).join('; ');
      return ApiResponse.error(res, errors, 400);
    }

    const { password, twoFactorCode, method } = value;

    try {
      const userId = req.user.id || req.user._id;
      const user = await User.findById(userId);

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      if (!user.twoFactor?.enabled) {
        return ApiResponse.error(res, '2FA is not enabled', 400);
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid password', 401);
      }

      // Verify 2FA code
      let verified = false;

      if (method === 'totp') {
        const decryptedSecret = twoFactorService.decryptSecret(user.twoFactor.secret);
        verified = twoFactorService.verifyToken(decryptedSecret, twoFactorCode);
      } else if (method === 'backup') {
        for (const backupCode of user.twoFactor.backupCodes) {
          if (backupCode.usedAt) continue;

          const isValid = await twoFactorService.verifyBackupCode(twoFactorCode, backupCode.code);
          if (isValid) {
            verified = true;
            break;
          }
        }
      }

      if (!verified) {
        return ApiResponse.error(res, 'Invalid 2FA code', 401);
      }

      // Disable 2FA and clear all data
      user.twoFactor = {
        enabled: false,
        secret: null,
        algorithm: 'sha1',
        encoding: 'base32',
        verifiedAt: null,
        backupCodes: [],
      };

      await user.save();

      return ApiResponse.success(res, { success: true }, 'Two-factor authentication disabled', 200);
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },
  revokeTrustedDevice: async (req, res) => {
    return ApiResponse.error(res, 'Trusted devices not implemented yet', 501);
  },
};

export default authController;