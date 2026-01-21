import express from 'express';
import authController from '../controllers/authController.js';
import protect from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import {
  authRateLimit,
  twoFactorRateLimit,
  passwordResetRateLimit,
} from '../middleware/rateLimiter.js';
import { activityLogger } from '../middleware/activityLogger.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validations/authValidation.js';
// 2FA schemas - using simple validation for now
const twoFactorSetupSchema = { body: registerSchema };
const twoFactorVerifySchema = { body: loginSchema };

const router = express.Router();

// Basic authentication with strict rate limiting and validation
router.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  activityLogger({ action: 'register' }),
  authController.register
);

router.post(
  '/login',
  authRateLimit,
  validate(loginSchema),
  activityLogger({ action: 'login' }),
  authController.login
);

router.post(
  '/login-2fa',
  twoFactorRateLimit,
  validate(twoFactorVerifySchema),
  activityLogger({ action: 'login_2fa' }),
  authController.loginWith2FA
);

router.post(
  '/forgot-password',
  passwordResetRateLimit,
  validate(forgotPasswordSchema),
  activityLogger({ action: 'password_reset_request' }),
  authController.forgotPassword
);

router.post(
  '/reset-password/:token',
  passwordResetRateLimit,
  validate(resetPasswordSchema),
  activityLogger({ action: 'password_change' }),
  authController.resetPassword
);

// Token refresh & logout (public; use refresh token in body)
router.post(
  '/refresh',
  authRateLimit,
  activityLogger({ action: 'token_refresh' }),
  authController.refresh
);

router.post('/logout', authRateLimit, activityLogger({ action: 'logout' }), authController.logout);

// 2FA Management (Protected routes)
router.use(protect); // Apply authentication middleware to all routes below

// SMS 2FA with rate limiting and validation
router.post(
  '/2fa/sms/enable',
  twoFactorRateLimit,
  validate(twoFactorSetupSchema),
  activityLogger({ action: 'enable_sms_2fa' }),
  authController.enableSMS2FA
);

router.post(
  '/2fa/sms/verify',
  twoFactorRateLimit,
  validate(twoFactorVerifySchema),
  activityLogger({ action: 'verify_sms_2fa' }),
  authController.verifySMS2FA
);

// TOTP 2FA with rate limiting and validation
router.post(
  '/2fa/totp/enable',
  twoFactorRateLimit,
  activityLogger({ action: 'enable_totp_2fa' }),
  authController.enableTOTP2FA
);

router.post(
  '/2fa/totp/verify',
  twoFactorRateLimit,
  validate(twoFactorVerifySchema),
  activityLogger({ action: 'verify_totp_2fa' }),
  authController.verifyTOTP2FA
);

// 2FA Status and Management
router.get(
  '/2fa/status',
  activityLogger({ action: 'view_2fa_status' }),
  authController.get2FAStatus
);

router.post(
  '/2fa/disable',
  twoFactorRateLimit,
  activityLogger({ action: 'disable_2fa' }),
  authController.disable2FA
);

// Trusted Device Management
router.delete(
  '/2fa/devices/:deviceId',
  activityLogger({ action: 'revoke_trusted_device' }),
  authController.revokeTrustedDevice
);

export default router;
