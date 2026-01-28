import crypto from 'crypto';

class TokenEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.secretKey = process.env.OAUTH_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    this.ivLength = 16;
    this.tagLength = 16;
  }

  // Encrypt OAuth tokens
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.secretKey);
      cipher.setAAD(Buffer.from('oauth-token', 'utf8'));

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  // Decrypt OAuth tokens
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, tag } = encryptedData;
      const decipher = crypto.createDecipher(this.algorithm, this.secretKey);
      decipher.setAAD(Buffer.from('oauth-token', 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  // Encrypt access token
  encryptAccessToken(accessToken) {
    return this.encrypt(accessToken);
  }

  // Decrypt access token
  decryptAccessToken(encryptedToken) {
    return this.decrypt(encryptedToken);
  }

  // Encrypt refresh token
  encryptRefreshToken(refreshToken) {
    return this.encrypt(refreshToken);
  }

  // Decrypt refresh token
  decryptRefreshToken(encryptedToken) {
    return this.decrypt(encryptedToken);
  }

  // Generate secure random string for state parameter
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Verify state parameter (prevent CSRF)
  verifyState(receivedState, storedState) {
    return crypto.timingSafeEqual(
      Buffer.from(receivedState, 'hex'),
      Buffer.from(storedState, 'hex')
    );
  }

  // Hash token for comparison (without storing the actual token)
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Verify token against hash
  verifyTokenHash(token, hash) {
    const tokenHash = this.hashToken(token);
    return crypto.timingSafeEqual(Buffer.from(tokenHash, 'hex'), Buffer.from(hash, 'hex'));
  }
}

// OAuth security utilities
class OAuthSecurity {
  constructor() {
    this.encryption = new TokenEncryption();
  }

  // Sanitize OAuth profile data
  sanitizeProfile(profile, provider) {
    const sanitized = {
      id: profile.id,
      provider: provider,
    };

    // Handle different provider profile structures
    switch (provider) {
      case 'google':
        sanitized.email = profile.emails?.[0]?.value;
        sanitized.name = profile.displayName;
        sanitized.avatar = profile.photos?.[0]?.value;
        sanitized.verified = profile.emails?.[0]?.verified || false;
        break;

      case 'github':
        sanitized.email = profile.emails?.find(e => e.primary)?.value || profile.emails?.[0]?.value;
        sanitized.username = profile.username;
        sanitized.name = profile.displayName;
        sanitized.avatar = profile.photos?.[0]?.value;
        sanitized.verified = !!profile.emails?.find(e => e.primary && e.verified);
        break;

      case 'microsoft':
        sanitized.email = profile.emails?.[0]?.value;
        sanitized.name = profile.displayName;
        sanitized.avatar = profile.photos?.[0]?.value;
        sanitized.verified = true; // Microsoft emails are verified
        break;

      default:
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // Validate required fields
    if (!sanitized.email) {
      throw new Error(`Email is required for ${provider} OAuth`);
    }

    return sanitized;
  }

  // Validate OAuth state
  validateState(req, res, next) {
    const { state } = req.query;
    const storedState = req.session.oauthState;

    if (!state || !storedState) {
      return res.status(400).json({
        success: false,
        message: 'OAuth state parameter is missing',
      });
    }

    try {
      if (!this.encryption.verifyState(state, storedState)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OAuth state parameter',
        });
      }

      // Clear the stored state after successful validation
      delete req.session.oauthState;
      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'OAuth state validation failed',
      });
    }
  }

  // Generate and store OAuth state
  generateState(req, res, next) {
    const state = this.encryption.generateState();
    req.session.oauthState = state;
    req.oauthState = state;
    next();
  }

  // Rate limiting for OAuth attempts
  rateLimitOAuth(req, res, next) {
    const key = `oauth_${req.ip}`;
    const attempts = req.session[key] || 0;
    const maxAttempts = 5; // Maximum 5 OAuth attempts per hour
    const windowMs = 60 * 60 * 1000; // 1 hour window

    if (attempts >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many OAuth attempts. Please try again later.',
      });
    }

    req.session[key] = attempts + 1;

    // Reset counter after window expires
    setTimeout(() => {
      req.session[key] = 0;
    }, windowMs);

    next();
  }

  // Validate OAuth provider configuration
  validateProviderConfig(provider, config) {
    const requiredFields = ['clientID', 'clientSecret', 'callbackURL'];

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required OAuth configuration: ${provider}.${field}`);
      }
    }

    // Validate callback URL format
    try {
      new URL(config.callbackURL);
    } catch {
      throw new Error(`Invalid callback URL for ${provider}: ${config.callbackURL}`);
    }

    return true;
  }
}

export default new OAuthSecurity();
