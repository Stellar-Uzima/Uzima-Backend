import express from 'express';
import oauthController from '../controllers/oauthController.js';
import protect from '../middleware/authMiddleware.js';
import { activityLogger } from '../middleware/activityLogger.js';
import { getEnabledProviders } from '../config/oauth.js';

const router = express.Router();

// Get enabled OAuth providers
router.get('/providers', (req, res) => {
  const enabledProviders = getEnabledProviders();
  return res.json({
    success: true,
    data: {
      providers: enabledProviders,
      oauthUrls: enabledProviders.reduce((urls, provider) => {
        urls[provider] = `/api/auth/${provider}`;
        return urls;
      }, {})
    }
  });
});

// OAuth authentication routes
/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Authenticate with Google OAuth
 *     description: Redirects to Google for OAuth authentication
 *     tags: [OAuth Authentication]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get('/google', oauthController.authenticateGoogle);

/**
 * @swagger
 * /api/auth/github:
 *   get:
 *     summary: Authenticate with GitHub OAuth
 *     description: Redirects to GitHub for OAuth authentication
 *     tags: [OAuth Authentication]
 *     responses:
 *       302:
 *         description: Redirect to GitHub OAuth
 */
router.get('/github', oauthController.authenticateGitHub);

/**
 * @swagger
 * /api/auth/microsoft:
 *   get:
 *     summary: Authenticate with Microsoft OAuth
 *     description: Redirects to Microsoft for OAuth authentication
 *     tags: [OAuth Authentication]
 *     responses:
 *       302:
 *         description: Redirect to Microsoft OAuth
 */
router.get('/microsoft', oauthController.authenticateMicrosoft);

// OAuth callback routes
/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     description: Handles Google OAuth callback and redirects with tokens
 *     tags: [OAuth Authentication]
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens
 */
router.get('/google/callback', oauthController.googleCallback);

/**
 * @swagger
 * /api/auth/github/callback:
 *   get:
 *     summary: GitHub OAuth callback
 *     description: Handles GitHub OAuth callback and redirects with tokens
 *     tags: [OAuth Authentication]
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens
 */
router.get('/github/callback', oauthController.githubCallback);

/**
 * @swagger
 * /api/auth/microsoft/callback:
 *   get:
 *     summary: Microsoft OAuth callback
 *     description: Handles Microsoft OAuth callback and redirects with tokens
 *     tags: [OAuth Authentication]
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens
 */
router.get('/microsoft/callback', oauthController.microsoftCallback);

// Protected OAuth routes (require authentication)
router.use(protect);

/**
 * @swagger
 * /api/auth/accounts:
 *   get:
 *     summary: Get linked OAuth accounts
 *     description: Retrieve all OAuth accounts linked to the current user
 *     tags: [OAuth Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Linked accounts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   provider:
 *                     type: string
 *                   email:
 *                     type: string
 *                   name:
 *                     type: string
 *                   linkedAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/accounts',
  activityLogger({ action: 'view_linked_accounts' }),
  oauthController.getLinkedAccounts
);

/**
 * @swagger
 * /api/auth/status:
 *   get:
 *     summary: Get OAuth status
 *     description: Get OAuth authentication status for current user
 *     tags: [OAuth Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OAuth status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isOAuthUser:
 *                   type: boolean
 *                 linkedProviders:
 *                   type: array
 *                 hasPassword:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/status',
  activityLogger({ action: 'view_oauth_status' }),
  oauthController.getOAuthStatus
);

/**
 * @swagger
 * /api/auth/link/{provider}:
 *   post:
 *     summary: Link OAuth account
 *     description: Link an OAuth account to the current user
 *     tags: [OAuth Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github, microsoft]
 *         description: OAuth provider name
 *     responses:
 *       200:
 *         description: OAuth account linked successfully
 *       400:
 *         description: Bad request - account already linked or invalid provider
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/link/:provider',
  activityLogger({ action: 'link_oauth_account' }),
  oauthController.linkOAuthAccount
);

/**
 * @swagger
 * /api/auth/unlink/{provider}:
 *   delete:
 *     summary: Unlink OAuth account
 *     description: Unlink an OAuth account from the current user
 *     tags: [OAuth Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github, microsoft]
 *         description: OAuth provider name
 *     responses:
 *       200:
 *         description: OAuth account unlinked successfully
 *       400:
 *         description: Bad request - account not linked or cannot unlink last auth method
 *       401:
 *         description: Unauthorized
 */
router.delete(
  '/unlink/:provider',
  activityLogger({ action: 'unlink_oauth_account' }),
  oauthController.unlinkOAuthAccount
);

/**
 * @swagger
 * /api/auth/refresh/{provider}:
 *   post:
 *     summary: Refresh OAuth token
 *     description: Refresh OAuth access token for a specific provider
 *     tags: [OAuth Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github, microsoft]
 *         description: OAuth provider name
 *     responses:
 *       200:
 *         description: OAuth token status retrieved
 *       400:
 *         description: Bad request - account not linked
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/refresh/:provider',
  activityLogger({ action: 'refresh_oauth_token' }),
  oauthController.refreshOAuthToken
);

export default router;
