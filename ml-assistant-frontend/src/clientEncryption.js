/**
 * Client-Side Encryption Utilities for PHI Protection (Browser Version)
 * 
 * This is the browser-compatible version of the client-side encryption library.
 * It uses Web Crypto API to encrypt PHI data before sending to the server.
 * 
 * Usage:
 * ```javascript
 * import { encryptPHI, decryptPHI, encryptRecordPHI, decryptRecordPHI } from './clientEncryption';
 * 
 * // Encrypt a single field
 * const encrypted = await encryptPHI('Patient diagnosis', 'userPassphrase');
 * 
 * // Encrypt a record
 * const record = { diagnosis: 'Diabetes', treatment: 'Metformin' };
 * const encryptedRecord = await encryptRecordPHI(record, 'userPassphrase');
 * 
 * // Decrypt a record
 * const decryptedRecord = await decryptRecordPHI(encryptedRecord, 'userPassphrase');
 * ```
 */

// Re-export from the main clientEncryption module
// In a browser environment, this would be the actual implementation
// For now, we'll create a browser-specific version

/**
 * PBKDF2 configuration for key derivation
 */
const PBKDF2_CONFIG = {
  iterations: 100000,
  hash: 'SHA-256',
  keyLength: 256,
};

/**
 * AES-GCM configuration
 */
const AES_GCM_CONFIG = {
  name: 'AES-GCM',
  ivLength: 12,
  tagLength: 128,
};

const ENCRYPTED_FORMAT_VERSION = 'v1';

/**
 * Checks if Web Crypto API is available
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
 */
async function deriveKey(passphrase, salt, usage) {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

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
    false,
    [usage]
  );

  return key;
}

/**
 * Encrypts PHI data using AES-GCM
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
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(AES_GCM_CONFIG.ivLength));

    const key = await deriveKey(passphrase, salt, 'encrypt');

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: AES_GCM_CONFIG.name,
        iv: iv,
        tagLength: AES_GCM_CONFIG.tagLength,
      },
      key,
      data
    );

    const encryptedArray = new Uint8Array(encryptedBuffer);
    const authTag = encryptedArray.slice(-16);
    const encryptedData = encryptedArray.slice(0, -16);

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
    const parts = encryptedData.split(':');
    
    if (parts.length !== 5) {
      throw new Error('Invalid encrypted data format');
    }

    const [version, saltBase64, ivBase64, encryptedDataBase64, authTagBase64] = parts;

    if (version !== ENCRYPTED_FORMAT_VERSION) {
      throw new Error(`Unsupported encryption format version: ${version}`);
    }

    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const encryptedDataBuffer = base64ToArrayBuffer(encryptedDataBase64);
    const authTag = new Uint8Array(base64ToArrayBuffer(authTagBase64));

    const encryptedArray = new Uint8Array(encryptedDataBuffer.byteLength + authTag.byteLength);
    encryptedArray.set(new Uint8Array(encryptedDataBuffer), 0);
    encryptedArray.set(authTag, encryptedDataBuffer.byteLength);

    const key = await deriveKey(passphrase, salt, 'decrypt');

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: AES_GCM_CONFIG.name,
        iv: iv,
        tagLength: AES_GCM_CONFIG.tagLength,
      },
      key,
      encryptedArray.buffer
    );

    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decryptedBuffer);

    return plaintext;
  } catch (error) {
    if (error.message.includes('Invalid encrypted data format') || 
        error.message.includes('Unsupported encryption format')) {
      throw error;
    }
    throw new Error('Decryption failed. Invalid passphrase or corrupted data.');
  }
}

/**
 * Checks if a string is in the encrypted format
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
 */
export async function encryptRecordPHI(record, passphrase, phiFields = ['diagnosis', 'treatment', 'history']) {
  if (!record || typeof record !== 'object') {
    throw new Error('Record must be an object');
  }

  const encryptedRecord = { ...record };

  for (const field of phiFields) {
    if (encryptedRecord[field] && typeof encryptedRecord[field] === 'string') {
      if (!isClientEncrypted(encryptedRecord[field])) {
        encryptedRecord[field] = await encryptPHI(encryptedRecord[field], passphrase);
      }
    }
  }

  return encryptedRecord;
}

/**
 * Decrypts multiple PHI fields in a record object
 */
export async function decryptRecordPHI(record, passphrase, phiFields = ['diagnosis', 'treatment', 'history']) {
  if (!record || typeof record !== 'object') {
    throw new Error('Record must be an object');
  }

  const decryptedRecord = { ...record };

  for (const field of phiFields) {
    if (decryptedRecord[field] && typeof decryptedRecord[field] === 'string') {
      if (isClientEncrypted(decryptedRecord[field])) {
        decryptedRecord[field] = await decryptPHI(decryptedRecord[field], passphrase);
      }
    }
  }

  return decryptedRecord;
}

/**
 * Encrypts an array of records
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
