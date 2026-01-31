// encryptionUtils.js

// AES-GCM Encryption
async function encryptAESGCM(plaintext, password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const keyMaterial = await getKeyMaterial(password);
  const key = await getKey(keyMaterial, 'encrypt');
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encryptedBuffer),
  };
}

// AES-GCM Decryption
async function decryptAESGCM(encryptedData, password) {
  const { iv, data } = encryptedData;
  const keyMaterial = await getKeyMaterial(password);
  const key = await getKey(keyMaterial, 'decrypt');
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToArrayBuffer(iv),
    },
    key,
    base64ToArrayBuffer(data)
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Get Key Material
async function getKeyMaterial(password) {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    {
      name: 'PBKDF2',
    },
    false,
    ['deriveBits', 'deriveKey']
  );
}

// Derive Key from Password
async function getKey(keyMaterial, usage) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // Non-exportable
    [usage]
  );

  return key;
}

// Utility to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Utility to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export { encryptAESGCM, decryptAESGCM };
