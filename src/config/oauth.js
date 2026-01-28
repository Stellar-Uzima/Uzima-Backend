import dotenv from 'dotenv';

dotenv.config();

const oauthConfig = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    scope: ['profile', 'email'],
  },
  github: {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
    scope: ['user:email'],
  },
  microsoft: {
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/api/auth/microsoft/callback',
    scope: ['openid', 'profile', 'email'],
  },
};

// Validate required environment variables
const validateOAuthConfig = () => {
  const missingVars = [];

  Object.keys(oauthConfig).forEach(provider => {
    if (!oauthConfig[provider].clientID) {
      missingVars.push(`${provider.toUpperCase()}_CLIENT_ID`);
    }
    if (!oauthConfig[provider].clientSecret) {
      missingVars.push(`${provider.toUpperCase()}_CLIENT_SECRET`);
    }
  });

  if (missingVars.length > 0) {
    console.warn('Missing OAuth environment variables:', missingVars.join(', '));
    console.warn('OAuth providers with missing credentials will be disabled');
  }

  return missingVars.length === 0;
};

// Get enabled providers
const getEnabledProviders = () => {
  return Object.keys(oauthConfig).filter(
    provider => oauthConfig[provider].clientID && oauthConfig[provider].clientSecret
  );
};

// Session configuration for OAuth
const sessionConfig = {
  secret:
    process.env.OAUTH_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
};

// JWT configuration for OAuth tokens
const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
};

export { oauthConfig, validateOAuthConfig, getEnabledProviders, sessionConfig, jwtConfig };
