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
import mailer from '../services/email.Service.js';
import crypto from 'crypto';
import { resetPasswordEmail } from '../templates/resetPasswordEmail.js';
import { sendSMS } from '../services/smsService.js';

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
    const { email, password, code } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      if (!user.security.twoFactorCode || !user.security.twoFactorCodeExpires) {
        return ApiResponse.error(res, 'No 2FA code generated', 400);
      }

      if (user.security.twoFactorCodeExpires < Date.now()) {
        return ApiResponse.error(res, '2FA code expired', 400);
      }

      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
      if (hashedCode !== user.security.twoFactorCode) {
        return ApiResponse.error(res, 'Invalid 2FA code', 401);
      }

      // Clear 2FA code
      user.security.twoFactorCode = undefined;
      user.security.twoFactorCodeExpires = undefined;
      await user.save();

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const rawRefreshToken = crypto.randomBytes(48).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      const { expiresAt } = generateRefreshTokenPayload(user);

      await RefreshToken.create({
        userId: user._id,
        tokenHash,
        expiresAt,
        createdByIp: req.ip,
        userAgent: req.get('User-Agent') || null,
      });

      const resUser = {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      };

      return ApiResponse.success(res, { user: resUser, accessToken, refreshToken: rawRefreshToken }, 'Login successful');
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

      // Check if 2FA is enabled
      if (user.twoFactorMethod === 'sms' && user.isPhoneVerified) {
        // Generate and send code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

        user.security.twoFactorCode = hashedCode;
        user.security.twoFactorCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
        await user.save();

        await sendSMS(user.phoneNumber, `Your verification code is: ${code}`);

        return ApiResponse.success(res, { require2FA: true, method: 'sms' }, '2FA code sent', 200);
      }

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

  // 2FA stub methods
  enableSMS2FA: async (req, res) => {
    const { phoneNumber } = req.body;
    const userId = req.user.id;

    try {
      const user = await User.findById(userId);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      // Check if phone number is already in use by another user
      const existingPhone = await User.findOne({ phoneNumber, _id: { $ne: userId } });
      if (existingPhone) {
        return ApiResponse.error(res, 'Phone number already in use', 400);
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

      user.phoneNumber = phoneNumber;
      user.security.twoFactorCode = hashedCode;
      user.security.twoFactorCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
      await user.save();

      await sendSMS(phoneNumber, `Your verification code is: ${code}`);

      return ApiResponse.success(res, null, 'Verification code sent');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  verifySMS2FA: async (req, res) => {
    const { code } = req.body;
    const userId = req.user.id;

    try {
      const user = await User.findById(userId);
      if (!user) return ApiResponse.error(res, 'User not found', 404);

      if (!user.security.twoFactorCode || !user.security.twoFactorCodeExpires) {
        return ApiResponse.error(res, 'No verification code found', 400);
      }

      if (user.security.twoFactorCodeExpires < Date.now()) {
        return ApiResponse.error(res, 'Verification code expired', 400);
      }

      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
      if (hashedCode !== user.security.twoFactorCode) {
        return ApiResponse.error(res, 'Invalid verification code', 401);
      }

      user.isPhoneVerified = true;
      user.twoFactorMethod = 'sms';
      user.security.twoFactorCode = undefined;
      user.security.twoFactorCodeExpires = undefined;
      await user.save();

      return ApiResponse.success(res, null, 'SMS 2FA enabled successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },
  enableTOTP2FA: async (req, res) => {
    return ApiResponse.error(res, 'TOTP 2FA not implemented yet', 501);
  },
  verifyTOTP2FA: async (req, res) => {
    return ApiResponse.error(res, 'TOTP 2FA not implemented yet', 501);
  },
  get2FAStatus: async (req, res) => {
    return ApiResponse.success(res, { enabled: false, method: null }, '2FA status');
  },
  disable2FA: async (req, res) => {
    return ApiResponse.error(res, '2FA not implemented yet', 501);
  },
  revokeTrustedDevice: async (req, res) => {
    return ApiResponse.error(res, 'Trusted devices not implemented yet', 501);
  },
};

export default authController;