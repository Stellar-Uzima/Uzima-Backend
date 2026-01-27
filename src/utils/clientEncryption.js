/**
 * Client-Side Encryption Utilities for PHI Protection
 * 
 * This module provides client-side encryption using Web Crypto API (AES-GCM)
 * with PBKDF2 key derivation from user passphrase. All PHI data is encrypted
 * in the browser before being sent to the server, ensuring no unencrypted PHI
 * leaves the client environment.
 * 
 * @module clientEncryption
 */

/**
 * PBKDF2 configuration for key derivation
 */
const PBKDF2_CONFIG = {
  iterations: 100000, // OWASP recommended minimum
  hash: 'SHA-256',
  keyLength: 256, // AES-256
};

/**
 * AES-GCM configuration
 */
const AES_GCM_CONFIG = {
  name: 'AES-GCM',
  ivLength: 12, // 96-bit IV (recommended for GCM)
  tagLength: 128, // 128-bit authentication tag
};

/**
 * Encrypted data format: base64(salt:iv:encryptedData:authTag)
 * This format allows decryption without server-side knowledge of the passphrase
 */
const ENCRYPTED_FORMAT_VERSION = 'v1';

/**
 * Checks if Web Crypto API is available
 * @returns {boolean}
 */
export function isWebCryptoAvailable() {
  return (
    typeof window !== 'undefined' &&
    window.crypto &&
    window.crypto.subtle &&
    window.crypto.getRandomValues
  );
}

/**
 * Converts ArrayBuffer to base64 string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts base64 string to ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an encryption key from a passphrase using PBKDF2
 * @param {string} passphrase - User's passphrase
 * @param {Uint8Array} salt - Salt for key derivation (must be stored with encrypted data)
 * @param {string} usage - 'encrypt' or 'decrypt'
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase, salt, usage) {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available');
  }

  // Import passphrase as key material
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive key using PBKDF2
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_CONFIG.iterations,
      hash: PBKDF2_CONFIG.hash,
    },
    keyMaterial,
    {
      name: AES_GCM_CONFIG.name,
      length: PBKDF2_CONFIG.keyLength,
    },
    false, // Non-exportable (key never leaves browser)
    [usage]
  );

  return key;
}

/**
 * Encrypts PHI data using AES-GCM
 * 
 * @param {string} plaintext - Plaintext PHI data to encrypt
 * @param {string} passphrase - User's passphrase for key derivation
 * @returns {Promise<string>} Encrypted data in format: version:salt:iv:encryptedData:authTag (all base64)
 * 
 * @example
 * const encrypted = await encryptPHI('Patient diagnosis: Diabetes', 'userPassphrase123!');
 * // Returns: "v1:base64Salt:base64IV:base64EncryptedData:base64AuthTag"
 */
export async function encryptPHI(plaintext, passphrase) {
  if (!plaintext) {
    return plaintext;
  }

  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available. Client-side encryption requires a modern browser.');
  }

  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters long');
  }

  try {
    // Generate random salt (16 bytes) - must be stored with encrypted data
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    
    // Generate random IV (12 bytes for GCM)
    const iv = window.crypto.getRandomValues(new Uint8Array(AES_GCM_CONFIG.ivLength));

    // Derive encryption key from passphrase
    const key = await deriveKey(passphrase, salt, 'encrypt');

    // Encode plaintext
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Encrypt using AES-GCM
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: AES_GCM_CONFIG.name,
        iv: iv,
        tagLength: AES_GCM_CONFIG.tagLength,
      },
      key,
      data
    );

    // Extract authentication tag (last 16 bytes of encrypted data in GCM)
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const authTag = encryptedArray.slice(-16);
    const encryptedData = encryptedArray.slice(0, -16);

    // Format: version:salt:iv:encryptedData:authTag (all base64)
    const encryptedString = [
      ENCRYPTED_FORMAT_VERSION,
      arrayBufferToBase64(salt.buffer),
      arrayBufferToBase64(iv.buffer),
      arrayBufferToBase64(encryptedData.buffer),
      arrayBufferToBase64(authTag.buffer),
    ].join(':');

    return encryptedString;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypts PHI data using AES-GCM
 * 
 * @param {string} encryptedData - Encrypted data in format: version:salt:iv:encryptedData:authTag
 * @param {string} passphrase - User's passphrase for key derivation
 * @returns {Promise<string>} Decrypted plaintext
 * 
 * @example
 * const decrypted = await decryptPHI(encryptedString, 'userPassphrase123!');
 * // Returns: "Patient diagnosis: Diabetes"
 */
export async function decryptPHI(encryptedData, passphrase) {
  if (!encryptedData) {
    return encryptedData;
  }

  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available. Client-side decryption requires a modern browser.');
  }

  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Passphrase is required for decryption');
  }

  try {
    // Parse encrypted data format: version:salt:iv:encryptedData:authTag
    const parts = encryptedData.split(':');
    
    if (parts.length !== 5) {
      throw new Error('Invalid encrypted data format');
    }

    const [version, saltBase64, ivBase64, encryptedDataBase64, authTagBase64] = parts;

    if (version !== ENCRYPTED_FORMAT_VERSION) {
      throw new Error(`Unsupported encryption format version: ${version}`);
    }

    // Convert base64 strings to ArrayBuffers
    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const encryptedDataBuffer = base64ToArrayBuffer(encryptedDataBase64);
    const authTag = new Uint8Array(base64ToArrayBuffer(authTagBase64));

    // Combine encrypted data and auth tag (GCM format)
    const encryptedArray = new Uint8Array(encryptedDataBuffer.byteLength + authTag.byteLength);
    encryptedArray.set(new Uint8Array(encryptedDataBuffer), 0);
    encryptedArray.set(authTag, encryptedDataBuffer.byteLength);

    // Derive decryption key from passphrase
    const key = await deriveKey(passphrase, salt, 'decrypt');

    // Decrypt using AES-GCM
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: AES_GCM_CONFIG.name,
        iv: iv,
        tagLength: AES_GCM_CONFIG.tagLength,
      },
      key,
      encryptedArray.buffer
    );

    // Decode decrypted data
    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decryptedBuffer);

    return plaintext;
  } catch (error) {
    // Don't expose sensitive error details
    if (error.message.includes('Invalid encrypted data format') || 
        error.message.includes('Unsupported encryption format')) {
      throw error;
    }
    throw new Error('Decryption failed. Invalid passphrase or corrupted data.');
  }
}

/**
 * Checks if a string is in the encrypted format
 * This function works in both browser and Node.js environments
 * @param {string} data - Data to check
 * @returns {boolean}
 */
export function isClientEncrypted(data) {
  if (!data || typeof data !== 'string') {
    return false;
  }
  const parts = data.split(':');
  return parts.length === 5 && parts[0] === ENCRYPTED_FORMAT_VERSION;
}

/**
 * Encrypts multiple PHI fields in a record object
 * 
 * @param {Object} record - Record object with PHI fields
 * @param {string} passphrase - User's passphrase
 * @param {string[]} phiFields - Array of field names to encrypt (default: ['diagnosis', 'treatment', 'history'])
 * @returns {Promise<Object>} Record with encrypted PHI fields
 */
export async function encryptRecordPHI(record, passphrase, phiFields = ['diagnosis', 'treatment', 'history']) {
  if (!record || typeof record !== 'object') {
    throw new Error('Record must be an object');
  }

  const encryptedRecord = { ...record };

  // Encrypt each PHI field
  for (const field of phiFields) {
    if (encryptedRecord[field] && typeof encryptedRecord[field] === 'string') {
      // Skip if already encrypted
      if (!isClientEncrypted(encryptedRecord[field])) {
        encryptedRecord[field] = await encryptPHI(encryptedRecord[field], passphrase);
      }
    }
  }

  return encryptedRecord;
}

/**
 * Decrypts multiple PHI fields in a record object
 * 
 * @param {Object} record - Record object with encrypted PHI fields
 * @param {string} passphrase - User's passphrase
 * @param {string[]} phiFields - Array of field names to decrypt (default: ['diagnosis', 'treatment', 'history'])
 * @returns {Promise<Object>} Record with decrypted PHI fields
 */
export async function decryptRecordPHI(record, passphrase, phiFields = ['diagnosis', 'treatment', 'history']) {
  if (!record || typeof record !== 'object') {
    throw new Error('Record must be an object');
  }

  const decryptedRecord = { ...record };

  // Decrypt each PHI field
  for (const field of phiFields) {
    if (decryptedRecord[field] && typeof decryptedRecord[field] === 'string') {
      // Only decrypt if it's client-encrypted
      if (isClientEncrypted(decryptedRecord[field])) {
        decryptedRecord[field] = await decryptPHI(decryptedRecord[field], passphrase);
      }
    }
  }

  return decryptedRecord;
}

/**
 * Encrypts an array of records
 * 
 * @param {Array} records - Array of record objects
 * @param {string} passphrase - User's passphrase
 * @param {string[]} phiFields - Array of field names to encrypt
 * @returns {Promise<Array>} Array of records with encrypted PHI fields
 */
export async function encryptRecordsPHI(records, passphrase, phiFields = ['diagnosis', 'treatment', 'history']) {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array');
  }

  const encryptedRecords = await Promise.all(
    records.map(record => encryptRecordPHI(record, passphrase, phiFields))
  );

  return encryptedRecords;
}

/**
 * Decrypts an array of records
 * 
 * @param {Array} records - Array of record objects with encrypted PHI fields
 * @param {string} passphrase - User's passphrase
 * @param {string[]} phiFields - Array of field names to decrypt
 * @returns {Promise<Array>} Array of records with decrypted PHI fields
 */
export async function decryptRecordsPHI(records, passphrase, phiFields = ['diagnosis', 'treatment', 'history']) {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array');
  }

  const decryptedRecords = await Promise.all(
    records.map(record => decryptRecordPHI(record, passphrase, phiFields))
  );

  return decryptedRecords;
}
