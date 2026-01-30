import { encrypt, isEncrypted } from '../utils/encryptionUtils.js';
import { isClientEncrypted } from '../utils/clientEncryptionServer.js';

const FIELDS_TO_ENCRYPT = ['diagnosis', 'treatment', 'history'];

/**
 * Checks if data is already encrypted (either client-side or server-side)
 * @param {string} data - Data to check
 * @returns {boolean}
 */
function isAlreadyEncrypted(data) {
  if (!data || typeof data !== 'string') {
    return false;
  }
  // Check for client-side encryption format (v1:salt:iv:data:tag)
  if (isClientEncrypted(data)) {
    return true;
  }
  // Check for server-side encryption format (version:iv:authTag:encryptedContent)
  if (isEncrypted(data)) {
    return true;
  }
  return false;
}

/**
 * Middleware to encrypt PHI fields if not already encrypted
 *
 * This middleware supports both:
 * 1. Client-side encryption: If data is already client-encrypted, it's stored as-is
 * 2. Server-side encryption: If data is plaintext, it's encrypted server-side (backward compatibility)
 *
 * Client-encrypted data format: v1:salt:iv:encryptedData:authTag (all base64)
 * Server-encrypted data format: version:iv:authTag:encryptedContent
 */
function encryptPayload(req, res, next) {
  try {
    if (req.body) {
      FIELDS_TO_ENCRYPT.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          // Only encrypt if not already encrypted (client or server)
          if (!isAlreadyEncrypted(req.body[field])) {
            req.body[field] = encrypt(req.body[field]);
          }
          // If already encrypted, store as-is (no double encryption)
        }
      });

      // Handle bulk operations
      if (req.body.records && Array.isArray(req.body.records)) {
        req.body.records.forEach(record => {
          FIELDS_TO_ENCRYPT.forEach(field => {
            if (record[field] && typeof record[field] === 'string') {
              // Only encrypt if not already encrypted (client or server)
              if (!isAlreadyEncrypted(record[field])) {
                record[field] = encrypt(record[field]);
              }
              // If already encrypted, store as-is (no double encryption)
            }
          });
        });
      }
    }
    next();
  } catch (err) {
    console.error('Encryption failed:', err.message);
    res.status(500).json({
      success: false,
      message: 'Encryption error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

export default encryptPayload;
