import bcrypt from 'bcrypt';
import User from '../models/User.js';
import ApiResponse from '../utils/apiResponse.js';
import generateAccessToken, { generateRefreshTokenPayload } from '../utils/generateToken.js';
import RefreshToken from '../models/RefreshToken.js';
import LoginHistory from '../models/LoginHistory.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyTOTP2FASchema,
  disable2FASchema,
  loginWith2FASchema,
  changePasswordSchema,
} from '../validations/authValidation.js';
import mailer from '../services/email.Service.js';
import crypto from 'crypto';
import { resetPasswordEmail } from '../templates/resetPasswordEmail.js';
import { sendSMS } from '../services/smsService.js';
import * as twoFactorService from '../services/twoFactorService.js';
import jwt from 'jsonwebtoken';
import {
  validatePassword,
  calculatePasswordStrength,
  validatePasswordComplexity,
} from '../utils/passwordValidator.js';
import PasswordPolicyService from '../services/passwordPolicyService.js';
// Geolocation and fingerprinting imports (feat/ip-geolocation)
import geolocationService from '../services/geolocationService.js';
import fingerprintService from '../services/fingerprintService.js';
import fraudDetectionService from '../services/fraudDetectionService.js';
import notificationService from '../services/notificationService.js';
// Session metadata import (main)
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
        return ApiResponse.error(
          res,
          {
            message: 'Password does not meet policy requirements',
            errors: passwordValidation.feedback,
            strength: passwordValidation.scoreDetails,
          },
          400
        );
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
      return ApiResponse.success(
        res,
        { accessToken, refreshToken: newRawRefresh },
        'Token refreshed'
      );
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

      // Verify 2FA code based on method
      let verified = false;

      if (method === 'sms') {
        if (!user.security.twoFactorCode || !user.security.twoFactorCodeExpires) {
          return ApiResponse.error(res, 'No 2FA code generated', 400);
        }
        if (user.security.twoFactorCodeExpires < Date.now()) {
          return ApiResponse.error(res, '2FA code expired', 400);
        }
        const hashedCode = crypto.createHash('sha256').update(twoFactorCode).digest('hex');
        if (hashedCode !== user.security.twoFactorCode) {
          return ApiResponse.error(res, 'Invalid 2FA code', 401);
        }
        // Clear 2FA code
        user.security.twoFactorCode = undefined;
        user.security.twoFactorCodeExpires = undefined;
        await user.save();
        verified = true;
      } else if (method === 'totp') {
        // Decrypt secret and verify TOTP
        if (!user.twoFactor?.enabled) return ApiResponse.error(res, '2FA not enabled', 400);
        const decryptedSecret = twoFactorService.decryptSecret(user.twoFactor.secret);
        verified = twoFactorService.verifyToken(decryptedSecret, twoFactorCode);
      } else if (method === 'backup') {
        // Check backup codes
        if (!user.twoFactor?.enabled) return ApiResponse.error(res, '2FA not enabled', 400);
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

    const { email, password, fingerprint } = value;
    const userAgent = req.get('User-Agent') || '';
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

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

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        // Record failed login attempt
        const shouldLock = PasswordPolicyService.handleFailedLoginAttempt(user, 5, 15);
        await user.save();

        // Log failed login attempt with geolocation if fingerprint provided
        if (fingerprint) {
          try {
            const location = await geolocationService.getLocationFromIp(ipAddress);
            await LoginHistory.logLogin({
              userId: user._id,
              fingerprint: fingerprint.visitorId,
              ipAddress,
              location,
              userAgent,
              loginAt: new Date(),
              loginStatus: 'failed',
              isNewDevice: false,
              isNewLocation: false,
              fraudFlags: {
                impossibleTravel: false,
                suspiciousIp: false,
                unusualActivity: false,
              },
            });
          } catch (err) {
            // Don't fail login on logging error
            console.error('Failed to log failed login:', err);
          }
        }

        if (shouldLock) {
          return ApiResponse.error(
            res,
            'Too many failed attempts. Account locked for 15 minutes.',
            429
          );
        }
        return ApiResponse.error(res, 'Invalid credentials', 401);
      }

      // Check if 2FA is enabled (Upstream TOTP)
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

      // Check if SMS 2FA is enabled (HEAD extension)
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

      // Reset failed login attempts on successful login
      PasswordPolicyService.resetFailedLoginAttempts(user);

      // Check if password change is required
      const passwordStatus = PasswordPolicyService.getPasswordStatus(user);
      if (passwordStatus.requiresChange || passwordStatus.isExpired) {
        PasswordPolicyService.forcePasswordChange(user);
        await user.save();

        return ApiResponse.error(
          res,
          'Password change required. Please update your password.',
          403
        );
      }

      // === START: Geolocation and Fingerprinting Integration ===

      let securityContext = null;
      let deviceRecord = null;
      let locationData = null;
      let fraudCheck = null;

      if (fingerprint && fingerprintService.validateFingerprintData(fingerprint)) {
        try {
          // 1. Get IP geolocation
          locationData = await geolocationService.getLocationFromIp(ipAddress);

          // 2. Process fingerprint and find/create device
          const deviceResult = await fingerprintService.findOrCreateDevice(
            user._id,
            fingerprint,
            locationData,
            userAgent
          );
          deviceRecord = deviceResult.device;
          const isNewDevice = deviceResult.isNew;
          const isNewLocation = deviceResult.isNewLocation;

          // 3. Check for impossible travel
          const sessionId = crypto.randomBytes(16).toString('hex');
          fraudCheck = await fraudDetectionService.checkImpossibleTravel(
            user._id,
            locationData,
            sessionId
          );

          // 4. Create login history entry
          await LoginHistory.logLogin({
            userId: user._id,
            deviceId: deviceRecord._id,
            fingerprint: fingerprint.visitorId,
            ipAddress,
            location: locationData,
            userAgent,
            loginAt: new Date(),
            loginStatus: 'success',
            isNewDevice,
            isNewLocation,
            fraudFlags: fraudCheck.flags,
            fraudDetails: fraudCheck.details,
            notificationSent: false,
            sessionId,
          });

          // 5. Send notification if new device or suspicious activity
          if (isNewDevice || fraudCheck.impossibleTravel) {
            try {
              const notificationType = fraudCheck.impossibleTravel
                ? 'IMPOSSIBLE_TRAVEL_DETECTED'
                : isNewDevice
                  ? 'NEW_DEVICE_LOGIN'
                  : 'NEW_LOCATION_LOGIN';

              await notificationService.createSecurityNotification({
                userId: user._id,
                type: notificationType,
                title: fraudCheck.impossibleTravel
                  ? 'Suspicious login detected'
                  : isNewDevice
                    ? 'New device login'
                    : 'New location login',
                message: fraudCheck.impossibleTravel
                  ? `Impossible travel detected: ${locationData.city}, ${locationData.country}`
                  : `Your account was accessed from ${deviceRecord.displayName || 'a new device'} in ${locationData.city}, ${locationData.country}`,
                priority: fraudCheck.impossibleTravel ? 'high' : 'medium',
                metadata: {
                  device: deviceRecord.displayName,
                  location: `${locationData.city}, ${locationData.country}`,
                  ipAddress,
                  timestamp: new Date().toISOString(),
                  fraudDetails: fraudCheck.details,
                },
              });
            } catch (notifError) {
              // Don't fail login on notification error
              console.error('Failed to send security notification:', notifError);
            }
          }

          // 6. Build security context for response
          securityContext = {
            isNewDevice,
            isNewLocation,
            deviceId: deviceRecord._id,
            location: geolocationService.getLocationSummary(locationData),
            fraudFlags: fraudCheck.flags,
          };

          // Add fraud details if present
          if (fraudCheck.details) {
            securityContext.fraudDetails = {
              distanceKm: fraudCheck.details.distanceKm,
              timeDiffMinutes: fraudCheck.details.timeDiffMinutes,
              calculatedSpeedKmh: fraudCheck.details.calculatedSpeedKmh,
            };
          }
        } catch (securityError) {
          // Log security feature error but don't fail the login
          console.error('Error in security features:', securityError);
        }
      }

      // === END: Geolocation and Fingerprinting Integration ===

      // Prepare user data to return (exclude password)
      const { _id, username, email: userEmail, role } = user;
      const resUser = {
        id: _id,
        username,
        email: userEmail,
        role,
        passwordStatus: {
          daysUntilExpiry: passwordStatus.daysUntilExpiry,
          expiryWarning: passwordStatus.expiryWarning,
        },
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
        createdByIp: ipAddress,
        userAgent,
      });

      await user.save();

      // === START: Redis Session Setup (from main) ===
      req.session.userId = user.id;
      req.session.metadata = buildSessionMetadata(req);
      // === END: Redis Session Setup ===

      const responseData = {
        user: resUser,
        accessToken,
        refreshToken: rawRefreshToken,
      };

      // Add security context if available
      if (securityContext) {
        responseData.security = securityContext;
      }

      return ApiResponse.success(res, responseData, 'Login successful');
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

      // Validate password with comprehensive policy checks
      const passwordValidation = await validatePassword(
        password,
        user.security.passwordHistory || [],
        user.username,
        user.email
      );

      if (!passwordValidation.valid) {
        return ApiResponse.error(
          res,
          {
            message: 'Password does not meet policy requirements',
            errors: passwordValidation.feedback,
            strength: passwordValidation.scoreDetails,
          },
          400
        );
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Update password with policy service
      await PasswordPolicyService.updatePassword(user, hashedPassword);

      // Clear reset token
      user.security.passwordResetToken = undefined;
      user.security.passwordResetTokenExpires = undefined;

      await user.save();

      return ApiResponse.success(
        res,
        { message: 'Password reset successful' },
        'Password updated',
        200
      );
    } catch (error) {
      return ApiResponse.error(res, 'An error occurred processing your request', 500);
    }
  },

  // 2FA methods
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

      return ApiResponse.success(
        res,
        {
          score: strength.score,
          feedback: strength.feedback,
          suggestions: strength.suggestions,
          complexity: {
            valid: complexity.valid,
            issues: complexity.feedback,
          },
        },
        'Password strength analyzed'
      );
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
        return ApiResponse.error(
          res,
          {
            message: 'Password does not meet policy requirements',
            errors: passwordValidation.feedback,
            strength: passwordValidation.scoreDetails,
          },
          400
        );
      }

      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await PasswordPolicyService.updatePassword(user, hashedPassword);

      await user.save();

      return ApiResponse.success(
        res,
        { message: 'Password changed successfully' },
        'Password updated',
        200
      );
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
