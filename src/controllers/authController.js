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
  changePasswordSchema,
} from '../validations/authValidation.js';
import mailer from '../services/email.Service.js';
import crypto from 'crypto';
import { resetPasswordEmail } from '../templates/resetPasswordEmail.js';
import {
  validatePassword,
  calculatePasswordStrength,
  validatePasswordComplexity,
} from '../utils/passwordValidator.js';
import PasswordPolicyService from '../services/passwordPolicyService.js';
import { buildSessionMetadata } from '../utils/sessionMetadata.js';

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
          return ApiResponse.error(res, 'Email already exists', 400);
        }
        if (existingUser.username === username) {
          return ApiResponse.error(res, 'Username already exists', 400);
        }
      }

      // Validate password with comprehensive policy checks
      const passwordValidation = await validatePassword(password, [], username, email);
      if (!passwordValidation.valid) {
        return ApiResponse.error(res, {
          message: 'Password does not meet policy requirements',
          errors: passwordValidation.feedback,
          strength: passwordValidation.scoreDetails,
        }, 400);
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

      // Initialize password history and expiry
      await PasswordPolicyService.addToPasswordHistory(user, hashedPassword);
      PasswordPolicyService.setPasswordExpiry(user);
      user.security.passwordChangedAt = new Date();

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

      return ApiResponse.success(
        res,
        { user: resUser, accessToken, refreshToken: rawRefreshToken },
        'User registered successfully',
        201
      );
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

  loginWith2FA: async (req, res) => {
    // Stub implementation for 2FA login
    return ApiResponse.error(res, '2FA login not implemented yet', 501);
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

    // Check if account is locked
    if (PasswordPolicyService.isAccountLocked(user)) {
      const lockTimeRemaining = PasswordPolicyService.getLockTimeRemaining(user);
      await user.save();
      return ApiResponse.error(
        res,
        `Account is locked. Try again in ${lockTimeRemaining} minutes.`,
        429
      );
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await PasswordPolicyService.handleFailedAttempt(user);
      return ApiResponse.error(res, 'Invalid credentials', 401);
    }

    // ✅ Reset failed attempts on success
    PasswordPolicyService.resetAttempts(user);
    await user.save();

    // 🔐 REDIS SESSION SETUP (THIS IS THE KEY PART)
    req.session.userId = user.id;
    req.session.metadata = buildSessionMetadata(req);

    return ApiResponse.success(res, {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    return ApiResponse.error(res, 'Login failed', 500);
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

      // Validate password with comprehensive policy checks
      const passwordValidation = await validatePassword(
        password,
        user.security.passwordHistory || [],
        user.username,
        user.email
      );

      if (!passwordValidation.valid) {
        return ApiResponse.error(res, {
          message: 'Password does not meet policy requirements',
          errors: passwordValidation.feedback,
          strength: passwordValidation.scoreDetails,
        }, 400);
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Update password with policy service
      await PasswordPolicyService.updatePassword(user, hashedPassword);

      // Clear reset token
      user.security.passwordResetToken = undefined;
      user.security.passwordResetTokenExpires = undefined;

      await user.save();

      return ApiResponse.success(res, { message: 'Password reset successful' }, 'Password updated', 200);
    } catch (error) {
      return ApiResponse.error(res, 'An error occurred processing your request', 500);
    }
  },

  // 2FA stub methods
  enableSMS2FA: async (req, res) => {
    return ApiResponse.error(res, 'SMS 2FA not implemented yet', 501);
  },
  verifySMS2FA: async (req, res) => {
    return ApiResponse.error(res, 'SMS 2FA not implemented yet', 501);
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

  // Password Policy endpoints

  /**
   * Check password strength
   * POST /api/auth/password/strength
   */
  checkPasswordStrength: async (req, res) => {
    try {
      const { password } = req.body;

      if (!password) {
        return ApiResponse.error(res, 'Password is required', 400);
      }

      const strength = calculatePasswordStrength(password);
      const complexity = validatePasswordComplexity(password);

      return ApiResponse.success(res, {
        score: strength.score,
        feedback: strength.feedback,
        suggestions: strength.suggestions,
        complexity: {
          valid: complexity.valid,
          issues: complexity.feedback,
        },
      }, 'Password strength analyzed');
    } catch (error) {
      return ApiResponse.error(res, 'Error analyzing password strength', 500);
    }
  },

  /**
   * Change password (authenticated users only)
   * POST /api/auth/password/change
   */
  changePassword: async (req, res) => {
    try {
      // User must be authenticated
      if (!req.user) {
        return ApiResponse.error(res, 'Authentication required', 401);
      }

      const { error, value } = changePasswordSchema.validate(req.body, { abortEarly: false });
      if (error) {
        const errors = error.details.map(e => e.message).join('; ');
        return ApiResponse.error(res, errors, 400);
      }

      const { currentPassword, newPassword } = value;

      // Get fresh user document
      const user = await User.findById(req.user._id);
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Verify current password
      const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordCorrect) {
        return ApiResponse.error(res, 'Current password is incorrect', 401);
      }

      // Check if new password is same as current
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return ApiResponse.error(res, 'New password must be different from current password', 400);
      }

      // Validate new password with comprehensive policy checks
      const passwordValidation = await validatePassword(
        newPassword,
        user.security.passwordHistory || [],
        user.username,
        user.email
      );

      if (!passwordValidation.valid) {
        return ApiResponse.error(res, {
          message: 'Password does not meet policy requirements',
          errors: passwordValidation.feedback,
          strength: passwordValidation.scoreDetails,
        }, 400);
      }

      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await PasswordPolicyService.updatePassword(user, hashedPassword);

      await user.save();

      return ApiResponse.success(res, { message: 'Password changed successfully' }, 'Password updated', 200);
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * Get password status (authenticated users only)
   * GET /api/auth/password/status
   */
  getPasswordStatus: async (req, res) => {
    try {
      if (!req.user) {
        return ApiResponse.error(res, 'Authentication required', 401);
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      const passwordStatus = PasswordPolicyService.getPasswordStatus(user);

      return ApiResponse.success(res, passwordStatus, 'Password status retrieved');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },
};

export default authController;