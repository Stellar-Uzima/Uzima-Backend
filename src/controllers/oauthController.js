import passport from 'passport';
import jwt from 'jsonwebtoken';
import ApiResponse from '../utils/apiResponse.js';
import User from '../models/User.js';
import { jwtConfig } from '../config/oauth.js';
import { withTransaction } from '../utils/withTransaction.js';
import transactionLog from '../models/transactionLog.js';

const oauthController = {
  // Generate JWT token for user
  generateToken: (user) => {
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      username: user.username
    };

    const accessToken = jwt.sign(payload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn
    });

    const refreshToken = jwt.sign(
      { id: user._id, type: 'refresh' },
      jwtConfig.secret,
      { expiresIn: jwtConfig.refreshExpiresIn }
    );

    return { accessToken, refreshToken };
  },

  // OAuth authentication routes
  authenticateGoogle: passport.authenticate('google', { session: false }),
  authenticateGitHub: passport.authenticate('github', { session: false }),
  authenticateMicrosoft: passport.authenticate('microsoft', { session: false }),

  // OAuth callback handlers
  googleCallback: async (req, res) => {
    return oauthController.handleOAuthCallback(req, res, 'google');
  },

  githubCallback: async (req, res) => {
    return oauthController.handleOAuthCallback(req, res, 'github');
  },

  microsoftCallback: async (req, res) => {
    return oauthController.handleOAuthCallback(req, res, 'microsoft');
  },

  // Generic OAuth callback handler
  handleOAuthCallback: async (req, res, provider) => {
    passport.authenticate(provider, { session: false }, async (err, user, info) => {
      try {
        if (err) {
          console.error(`OAuth ${provider} error:`, err);
          return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=${encodeURIComponent('Authentication failed')}`);
        }

        if (!user) {
          return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=${encodeURIComponent('User not found')}`);
        }

        // Log the OAuth login
        await withTransaction(async (session) => {
          await transactionLog.create(
            [
              {
                action: 'oauth_login',
                resource: 'User',
                resourceId: user._id,
                performedBy: user._id,
                timestamp: new Date(),
                details: `User logged in via ${provider} OAuth`,
                metadata: {
                  provider,
                  email: user.email,
                  userAgent: req.get('User-Agent'),
                  ipAddress: req.ip
                }
              }
            ],
            { session }
          );
        });

        // Generate JWT tokens
        const { accessToken, refreshToken } = oauthController.generateToken(user);

        // Redirect to frontend with tokens
        const redirectUrl = `${process.env.FRONTEND_URL}/auth/success?` +
          `access_token=${encodeURIComponent(accessToken)}&` +
          `refresh_token=${encodeURIComponent(refreshToken)}&` +
          `provider=${provider}`;

        res.redirect(redirectUrl);

      } catch (error) {
        console.error(`OAuth ${provider} callback error:`, error);
        res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=${encodeURIComponent('Server error')}`);
      }
    })(req, res);
  },

  // Get linked OAuth accounts for current user
  getLinkedAccounts: async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      const linkedAccounts = user.getOAuthProviders();
      return ApiResponse.success(res, linkedAccounts, 'Linked accounts retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Link OAuth account to existing user
  linkOAuthAccount: async (req, res) => {
    try {
      const { provider } = req.params;
      const { code } = req.query;

      if (!code) {
        return ApiResponse.error(res, 'Authorization code is required', 400);
      }

      // This would typically involve exchanging the code for tokens
      // and getting user profile from the OAuth provider
      // For now, we'll use Passport's authenticate method
      passport.authenticate(provider, { session: false }, async (err, profile) => {
        try {
          if (err) {
            return ApiResponse.error(res, 'OAuth authentication failed', 400);
          }

          if (!profile) {
            return ApiResponse.error(res, 'Failed to retrieve profile', 400);
          }

          const user = await User.findById(req.user._id);
          if (!user) {
            return ApiResponse.error(res, 'User not found', 404);
          }

          // Check if already linked
          if (user.hasOAuthProvider(provider)) {
            return ApiResponse.error(res, `${provider} account is already linked`, 400);
          }

          // Check if another user has this OAuth account
          const existingUser = await User.findByOAuthProvider(provider, profile.id);
          if (existingUser) {
            return ApiResponse.error(res, `${provider} account is already linked to another user`, 400);
          }

          // Link the account
          await user.linkOAuthAccount(provider, profile);

          // Log the linking
          await withTransaction(async (session) => {
            await transactionLog.create(
              [
                {
                  action: 'link_oauth_account',
                  resource: 'User',
                  resourceId: user._id,
                  performedBy: user._id,
                  timestamp: new Date(),
                  details: `Linked ${provider} account to user`,
                  metadata: {
                    provider,
                    oauthId: profile.id,
                    oauthEmail: profile.email
                  }
                }
              ],
              { session }
            );
          });

          return ApiResponse.success(res, null, `${provider} account linked successfully`);

        } catch (error) {
          return ApiResponse.error(res, error.message, 500);
        }
      })(req, res);

    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Unlink OAuth account
  unlinkOAuthAccount: async (req, res) => {
    try {
      const { provider } = req.params;
      const user = await User.findById(req.user._id);

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Check if provider is linked
      if (!user.hasOAuthProvider(provider)) {
        return ApiResponse.error(res, `${provider} account is not linked`, 400);
      }

      // Unlink the account
      await user.unlinkOAuthAccount(provider);

      // Log the unlinking
      await withTransaction(async (session) => {
        await transactionLog.create(
          [
            {
              action: 'unlink_oauth_account',
              resource: 'User',
              resourceId: user._id,
              performedBy: user._id,
              timestamp: new Date(),
              details: `Unlinked ${provider} account from user`,
              metadata: {
                provider
              }
            }
          ],
          { session }
        );
      });

      return ApiResponse.success(res, null, `${provider} account unlinked successfully`);

    } catch (error) {
      if (error.message.includes('Cannot unlink last authentication method')) {
        return ApiResponse.error(res, error.message, 400);
      }
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Get OAuth provider status
  getOAuthStatus: async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      const status = {
        isOAuthUser: user.isOAuthUser(),
        linkedProviders: user.getOAuthProviders(),
        hasPassword: !!user.password
      };

      return ApiResponse.success(res, status, 'OAuth status retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Refresh OAuth tokens
  refreshOAuthToken: async (req, res) => {
    try {
      const { provider } = req.params;
      const user = await User.findById(req.user._id);

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      if (!user.hasOAuthProvider(provider)) {
        return ApiResponse.error(res, `${provider} account is not linked`, 400);
      }

      // This would typically involve using the refresh token to get new access token
      // Implementation depends on the specific OAuth provider
      // For now, we'll just return the current status
      const accountInfo = user.oauthAccounts[provider];
      
      return ApiResponse.success(res, {
        provider,
        hasRefreshToken: !!accountInfo.refreshToken,
        linkedAt: accountInfo.linkedAt
      }, 'OAuth token status retrieved');

    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  }
};

export default oauthController;
