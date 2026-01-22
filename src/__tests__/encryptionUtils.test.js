import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, isEncrypted, hashData } from '../utils/encryptionUtils.js';

describe('Encryption Utils', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      ENCRYPTION_KEY_SECRET_v1: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 32 bytes hex
      ENCRYPTION_KEY_CURRENT_VERSION: 'v1',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should encrypt and decrypt correctly', () => {
    const text = 'sensitive data';
    const encrypted = encrypt(text);

    expect(encrypted).not.toBe(text);
    expect(isEncrypted(encrypted)).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should generate different ciphertexts for same plaintext', () => {
    const text = 'same text';
    const encrypted1 = encrypt(text);
    const encrypted2 = encrypt(text);

    expect(encrypted1).not.toBe(encrypted2);
    expect(decrypt(encrypted1)).toBe(text);
    expect(decrypt(encrypted2)).toBe(text);
  });

  it('should handle null/undefined', () => {
    expect(encrypt(null)).toBe(null);
    expect(decrypt(null)).toBe(null);
  });

  it('should return original text if not encrypted', () => {
    const text = 'not encrypted';
    expect(decrypt(text)).toBe(text);
  });

  it('should hash data consistently', () => {
    const text = 'searchable';
    const hash1 = hashData(text);
    const hash2 = hashData(text);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(text);
  });
});
