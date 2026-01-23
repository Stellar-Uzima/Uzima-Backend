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
  changePasswordSchema,
} from '../validations/authValidation.js';
import {
  checkPasswordExpiry,
  injectPasswordStatus,
} from '../middleware/passwordPolicyMiddleware.js';
// 2FA schemas - using simple validation for now
const twoFactorSetupSchema = { body: registerSchema };
const twoFactorVerifySchema = { body: loginSchema };

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account with username, email, password, and role
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             username: johndoe
 *             email: john.doe@example.com
 *             password: SecureP@ss123
 *             role: patient
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Server error
 */
// Basic authentication with strict rate limiting and validation
router.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  activityLogger({ action: 'register' }),
  authController.register
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password to receive JWT tokens
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: john.doe@example.com
 *             password: SecureP@ss123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
router.post(
  '/login',
  authRateLimit,
  validate(loginSchema),
  activityLogger({ action: 'login' }),
  authController.login
);

/**
 * @swagger
 * /api/auth/login-2fa:
 *   post:
 *     summary: Login with 2FA
 *     description: Complete login with two-factor authentication code
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               code:
 *                 type: string
 *                 description: 2FA verification code
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials or 2FA code
 *       501:
 *         description: 2FA not implemented
 */
router.post(
  '/login-2fa',
  twoFactorRateLimit,
  validate(twoFactorVerifySchema),
  activityLogger({ action: 'login_2fa' }),
  authController.loginWith2FA
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Send a password reset link to the user's email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *     responses:
 *       200:
 *         description: Password reset email sent (if account exists)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 */
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  validate(forgotPasswordSchema),
  activityLogger({ action: 'password_reset_request' }),
  authController.forgotPassword
);

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password
 *     description: Reset password using the token received via email
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token from email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewSecureP@ss456
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post(
  '/reset-password/:token',
  passwordResetRateLimit,
  validate(resetPasswordSchema),
  activityLogger({ action: 'password_change' }),
  authController.resetPassword
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Exchange a valid refresh token for a new access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: a1b2c3d4e5f6...
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       401:
 *         description: Invalid or expired refresh token
 */
// Token refresh & logout (public; use refresh token in body)
router.post(
  '/refresh',
  authRateLimit,
  activityLogger({ action: 'token_refresh' }),
  authController.refresh
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Revoke the refresh token to logout the user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     revoked:
 *                       type: boolean
 */
router.post('/logout', authRateLimit, activityLogger({ action: 'logout' }), authController.logout);

// 2FA Management (Protected routes)
router.use(protect); // Apply authentication middleware to all routes below

/**
 * @swagger
 * /api/auth/2fa/sms/enable:
 *   post:
 *     summary: Enable SMS 2FA
 *     description: Enable SMS-based two-factor authentication
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *     responses:
 *       200:
 *         description: SMS 2FA enabled, verification code sent
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Not implemented
 */
// SMS 2FA with rate limiting and validation
router.post(
  '/2fa/sms/enable',
  twoFactorRateLimit,
  validate(twoFactorSetupSchema),
  activityLogger({ action: 'enable_sms_2fa' }),
  authController.enableSMS2FA
);

/**
 * @swagger
 * /api/auth/2fa/sms/verify:
 *   post:
 *     summary: Verify SMS 2FA code
 *     description: Verify the SMS code to complete 2FA setup
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: SMS 2FA verified successfully
 *       401:
 *         description: Invalid code
 *       501:
 *         description: Not implemented
 */
router.post(
  '/2fa/sms/verify',
  twoFactorRateLimit,
  validate(twoFactorVerifySchema),
  activityLogger({ action: 'verify_sms_2fa' }),
  authController.verifySMS2FA
);

/**
 * @swagger
 * /api/auth/2fa/totp/enable:
 *   post:
 *     summary: Enable TOTP 2FA
 *     description: Enable authenticator app (TOTP) based two-factor authentication
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP secret generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     secret:
 *                       type: string
 *                       description: TOTP secret for authenticator app
 *                     qrCode:
 *                       type: string
 *                       description: QR code data URL
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Not implemented
 */
// TOTP 2FA with rate limiting and validation
router.post(
  '/2fa/totp/enable',
  twoFactorRateLimit,
  activityLogger({ action: 'enable_totp_2fa' }),
  authController.enableTOTP2FA
);

/**
 * @swagger
 * /api/auth/2fa/totp/verify:
 *   post:
 *     summary: Verify TOTP code
 *     description: Verify the TOTP code from authenticator app
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: TOTP verified successfully
 *       401:
 *         description: Invalid code
 *       501:
 *         description: Not implemented
 */
router.post(
  '/2fa/totp/verify',
  twoFactorRateLimit,
  validate(twoFactorVerifySchema),
  activityLogger({ action: 'verify_totp_2fa' }),
  authController.verifyTOTP2FA
);

/**
 * @swagger
 * /api/auth/2fa/status:
 *   get:
 *     summary: Get 2FA status
 *     description: Get the current 2FA configuration status for the user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     method:
 *                       type: string
 *                       nullable: true
 *                       enum: [sms, totp, null]
 *       401:
 *         description: Unauthorized
 */
// 2FA Status and Management
router.get(
  '/2fa/status',
  activityLogger({ action: 'view_2fa_status' }),
  authController.get2FAStatus
);

/**
 * @swagger
 * /api/auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     description: Disable two-factor authentication for the user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for confirmation
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 *       401:
 *         description: Unauthorized or invalid password
 *       501:
 *         description: Not implemented
 */
router.post(
  '/2fa/disable',
  twoFactorRateLimit,
  activityLogger({ action: 'disable_2fa' }),
  authController.disable2FA
);

/**
 * @swagger
 * /api/auth/2fa/devices/{deviceId}:
 *   delete:
 *     summary: Revoke trusted device
 *     description: Remove a device from the list of trusted devices
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID to revoke
 *     responses:
 *       200:
 *         description: Device revoked successfully
 *       404:
 *         description: Device not found
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Not implemented
 */
// Trusted Device Management
router.delete(
  '/2fa/devices/:deviceId',
  activityLogger({ action: 'revoke_trusted_device' }),
  authController.revokeTrustedDevice
);

// ============================================
// Password Policy Routes
// ============================================

/**
 * @swagger
 * /api/auth/password/strength:
 *   post:
 *     summary: Check password strength
 *     description: Analyze password strength and get feedback (public endpoint)
 *     tags: [Auth, Password Policy]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 1
 *                 example: "MySecureP@ss123"
 *     responses:
 *       200:
 *         description: Password strength analyzed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     score:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 4
 *                       description: "0=Very weak, 1=Weak, 2=Fair, 3=Strong, 4=Very strong"
 *                     feedback:
 *                       type: string
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     complexity:
 *                       type: object
 *                       properties:
 *                         valid:
 *                           type: boolean
 *                         issues:
 *                           type: array
 *                           items:
 *                             type: string
 *       400:
 *         description: Validation error
 */
router.post(
  '/password/strength',
  authRateLimit,
  activityLogger({ action: 'check_password_strength' }),
  authController.checkPasswordStrength
);

/**
 * @swagger
 * /api/auth/password/change:
 *   post:
 *     summary: Change password (authenticated)
 *     description: Change password for authenticated user with current password verification
 *     tags: [Auth, Password Policy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: "OldP@ssw0rd"
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])'
 *                 example: "NewSecureP@ss456"
 *               confirmPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: "NewSecureP@ss456"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error or password policy violation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Unauthorized or invalid current password
 */
router.post(
  '/password/change',
  protect,
  checkPasswordExpiry,
  injectPasswordStatus,
  passwordResetRateLimit,
  validate(changePasswordSchema),
  activityLogger({ action: 'change_password' }),
  authController.changePassword
);

/**
 * @swagger
 * /api/auth/password/status:
 *   get:
 *     summary: Get password status (authenticated)
 *     description: Get password expiry and policy status for the authenticated user
 *     tags: [Auth, Password Policy]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Password status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isExpired:
 *                       type: boolean
 *                     daysUntilExpiry:
 *                       type: number
 *                       nullable: true
 *                     requiresChange:
 *                       type: boolean
 *                     expiryWarning:
 *                       type: string
 *                       nullable: true
 *                       enum: [danger, warning, info, null]
 *                     isLocked:
 *                       type: boolean
 *                     lockTimeRemaining:
 *                       type: number
 *                     lastChanged:
 *                       type: string
 *                       format: date-time
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     historyCount:
 *                       type: integer
 *                     maxHistoryCount:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/password/status',
  protect,
  activityLogger({ action: 'view_password_status' }),
  authController.getPasswordStatus
);

export default router;
