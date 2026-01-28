import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment or derive from JWT_SECRET
 * @returns {Buffer} 32-byte encryption key
 */
const getEncryptionKey = () => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    // If provided, ensure it's 32 bytes
    const key = Buffer.from(envKey, 'hex');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    return key;
  }

  // Derive from JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET || 'secret';
  return crypto.pbkdf2Sync(jwtSecret, 'totp-encryption-salt', 100000, 32, 'sha256');
};

/**
 * Generate a new TOTP secret for a user
 * @returns {Object} { secret, otpauthUrl }
 */
export const generateSecret = () => {
  const secret = speakeasy.generateSecret({
    name: 'Uzima',
    length: 32,
  });

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
  };
};

/**
 * Generate QR code data URL for authenticator app setup
 * @param {string} secret - Base32 encoded secret
 * @param {string} email - User's email address
 * @returns {Promise<string>} QR code data URL
 */
export const generateQRCode = async (secret, email) => {
  const otpauthUrl = speakeasy.otpauthURL({
    secret,
    label: email,
    issuer: 'Uzima',
    encoding: 'base32',
  });

  return await QRCode.toDataURL(otpauthUrl);
};

/**
 * Verify a TOTP token
 * @param {string} secret - Base32 encoded secret
 * @param {string} token - 6-digit TOTP token
 * @param {number} window - Time step window (default: 1)
 * @returns {boolean} Whether token is valid
 */
export const verifyToken = (secret, token, window = 1) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window, // Allow ±1 time step (30 seconds before/after)
  });
};

/**
 * Generate 8 random backup codes
 * @returns {string[]} Array of 8 backup codes (format: XXXX-XXXX)
 */
export const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    // Generate 8 random bytes and convert to alphanumeric
    const randomBytes = crypto.randomBytes(4);
    const code = randomBytes.toString('hex').toUpperCase();
    // Format as XXXX-XXXX
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    codes.push(formatted);
  }
  return codes;
};

/**
 * Hash a backup code using bcrypt
 * @param {string} code - Plain backup code
 * @returns {Promise<string>} Hashed code
 */
export const hashBackupCode = async (code) => {
  // Remove hyphens before hashing
  const normalized = code.replace(/-/g, '');
  return await bcrypt.hash(normalized, 10);
};

/**
 * Verify a backup code against a hash
 * @param {string} code - Plain backup code
 * @param {string} hashedCode - Hashed code from database
 * @returns {Promise<boolean>} Whether code matches
 */
export const verifyBackupCode = async (code, hashedCode) => {
  // Remove hyphens before comparing
  const normalized = code.replace(/-/g, '');
  return await bcrypt.compare(normalized, hashedCode);
};

/**
 * Encrypt a TOTP secret
 * @param {string} secret - Plain secret
 * @returns {string} Encrypted secret (format: iv:authTag:encrypted)
 */
export const encryptSecret = (secret) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt a TOTP secret
 * @param {string} encryptedData - Encrypted secret (format: iv:authTag:encrypted)
 * @returns {string} Plain secret
 */
export const decryptSecret = (encryptedData) => {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Generate a temporary JWT token for 2FA pending state
 * @param {Object} user - User object
 * @returns {string} JWT token with 5-minute expiry
 */
export const generateTempToken = async (user) => {
  const jwt = await import('jsonwebtoken');
  return jwt.default.sign(
    {
      id: user._id,
      email: user.email,
      twoFactorPending: true,
    },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '5m' }
  );
};

export default {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptSecret,
  decryptSecret,
  generateTempToken,
};
