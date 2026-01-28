/**
 * Server-side utilities for detecting client-encrypted data
 *
 * This module provides server-side functions to detect and handle
 * client-encrypted PHI data without requiring Web Crypto API.
 */

/**
 * Client-encrypted data format: version:salt:iv:encryptedData:authTag (all base64)
 */
const ENCRYPTED_FORMAT_VERSION = 'v1';

/**
 * Checks if a string is in the client-encrypted format
 * This is a server-side version that doesn't require Web Crypto API
 * @param {string} data - Data to check
 * @returns {boolean}
 */
export function isClientEncrypted(data) {
  if (!data || typeof data !== 'string') {
    return false;
  }
  const parts = data.split(':');
  // Client-encrypted format: version:salt:iv:encryptedData:authTag (5 parts)
  return parts.length === 5 && parts[0] === ENCRYPTED_FORMAT_VERSION;
}

/**
 * Validates that encrypted data has the correct structure
 * @param {string} encryptedData - Encrypted data to validate
 * @returns {boolean}
 */
export function isValidClientEncryptedFormat(encryptedData) {
  if (!isClientEncrypted(encryptedData)) {
    return false;
  }

  const parts = encryptedData.split(':');
  const [, saltBase64, ivBase64, dataBase64, tagBase64] = parts;

  // Validate base64 format (basic check)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

  return (
    base64Regex.test(saltBase64) &&
    base64Regex.test(ivBase64) &&
    base64Regex.test(dataBase64) &&
    base64Regex.test(tagBase64)
  );
}
