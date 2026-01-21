import crypto from 'crypto';
import { Buffer } from 'buffer';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended for GCM
const AUTH_TAG_LENGTH = 16;

const getMasterKey = version => {
  const keyHex = process.env[`ENCRYPTION_KEY_SECRET_${version}`];
  if (!keyHex) {
    throw new Error(`Encryption key for version ${version} not found`);
  }
  return Buffer.from(keyHex, 'hex');
};

const getCurrentVersion = () => {
  return process.env.ENCRYPTION_KEY_CURRENT_VERSION || 'v1';
};

/**
 * Encrypts text using AES-256-GCM
 * @param {string} text - Text to encrypt
 * @returns {string} - Format: version:iv:authTag:encryptedText
 */
export const encrypt = text => {
  if (!text) return text;

  const version = getCurrentVersion();
  const key = getMasterKey(version);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: version:iv:authTag:encryptedContent
  return `${version}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts text using AES-256-GCM
 * @param {string} encryptedText - Encrypted text in format version:iv:authTag:encryptedText
 * @returns {string} - Decrypted text
 */
export const decrypt = encryptedText => {
  if (!encryptedText) return encryptedText;

  // Check if it matches the format version:iv:authTag:encryptedContent
  // Simple check: needs at least 3 colons
  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    // Return original if not encrypted or invalid format (fallback)
    return encryptedText;
  }

  const [version, ivHex, authTagHex, encryptedContent] = parts;

  try {
    const key = getMasterKey(version);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error(`Decryption failed for version ${version}:`, error);
    throw new Error('Decryption failed');
  }
};

/**
 * Checks if a string is encrypted
 * @param {string} text
 * @returns {boolean}
 */
export const isEncrypted = text => {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  return parts.length === 4;
};

/**
 * Hash data for blind indexing
 * @param {string} text
 * @returns {string}
 */
export const hashData = text => {
  if (!text) return text;
  const version = getCurrentVersion();
  const key = getMasterKey(version);
  return crypto.createHmac('sha256', key).update(text).digest('hex');
};
