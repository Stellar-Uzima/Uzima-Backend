import { describe, it, expect, beforeAll } from 'vitest';
import * as twoFactorService from '../services/twoFactorService.js';
import speakeasy from 'speakeasy';

describe('TwoFactorService', () => {
  describe('generateSecret', () => {
    it('should generate a valid TOTP secret', () => {
      const { secret, otpauthUrl } = twoFactorService.generateSecret();

      expect(secret).toBeDefined();
      expect(secret).toMatch(/^[A-Z2-7]+=*$/); // Base32 format
      expect(secret.length).toBeGreaterThan(20);
      expect(otpauthUrl).toBeDefined();
      expect(otpauthUrl).toContain('otpauth://totp/');
    });

    it('should generate unique secrets on each call', () => {
      const secret1 = twoFactorService.generateSecret();
      const secret2 = twoFactorService.generateSecret();

      expect(secret1.secret).not.toBe(secret2.secret);
    });
  });

  describe('generateQRCode', () => {
    it('should generate a valid QR code data URL', async () => {
      const secret = 'JBSWY3DPEHPK3PXP'; // Test secret
      const email = 'test@example.com';

      const qrCode = await twoFactorService.generateQRCode(secret, email);

      expect(qrCode).toBeDefined();
      expect(qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid TOTP token', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const verified = twoFactorService.verifyToken(secret, token);
      expect(verified).toBe(true);
    });

    it('should reject an invalid TOTP token', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const invalidToken = '000000';

      const verified = twoFactorService.verifyToken(secret, invalidToken);
      expect(verified).toBe(false);
    });

    it('should accept tokens within time window (±1 step)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      // Generate a token from 30 seconds ago
      const pastToken = speakeasy.totp({
        secret,
        encoding: 'base32',
        time: Math.floor(Date.now() / 1000) - 30,
      });

      const verified = twoFactorService.verifyToken(secret, pastToken, 1);
      expect(verified).toBe(true);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 8 backup codes', () => {
      const codes = twoFactorService.generateBackupCodes();

      expect(codes).toHaveLength(8);
    });

    it('should generate codes in XXXX-XXXX format', () => {
      const codes = twoFactorService.generateBackupCodes();

      codes.forEach(code => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      });
    });

    it('should generate unique codes', () => {
      const codes = twoFactorService.generateBackupCodes();
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(8);
    });
  });

  describe('hashBackupCode and verifyBackupCode', () => {
    it('should hash and verify a backup code', async () => {
      const code = '1234-5678';
      const hashed = await twoFactorService.hashBackupCode(code);

      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(code);
      expect(hashed.length).toBeGreaterThan(40); // bcrypt hash length

      const verified = await twoFactorService.verifyBackupCode(code, hashed);
      expect(verified).toBe(true);
    });

    it('should normalize codes by removing hyphens', async () => {
      const codeWithHyphen = '1234-5678';
      const codeWithoutHyphen = '12345678';
      const hashed = await twoFactorService.hashBackupCode(codeWithHyphen);

      const verified = await twoFactorService.verifyBackupCode(codeWithoutHyphen, hashed);
      expect(verified).toBe(true);
    });

    it('should reject incorrect backup codes', async () => {
      const code = '1234-5678';
      const wrongCode = '8765-4321';
      const hashed = await twoFactorService.hashBackupCode(code);

      const verified = await twoFactorService.verifyBackupCode(wrongCode, hashed);
      expect(verified).toBe(false);
    });
  });

  describe('encryptSecret and decryptSecret', () => {
    it('should encrypt and decrypt a secret', () => {
      const originalSecret = 'JBSWY3DPEHPK3PXP';

      const encrypted = twoFactorService.encryptSecret(originalSecret);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(originalSecret);
      expect(encrypted).toContain(':'); // Should have IV:authTag:encrypted format

      const decrypted = twoFactorService.decryptSecret(encrypted);
      expect(decrypted).toBe(originalSecret);
    });

    it('should produce different encrypted values for the same secret', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      const encrypted1 = twoFactorService.encryptSecret(secret);
      const encrypted2 = twoFactorService.encryptSecret(secret);

      // Different IVs should produce different encrypted values
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(twoFactorService.decryptSecret(encrypted1)).toBe(secret);
      expect(twoFactorService.decryptSecret(encrypted2)).toBe(secret);
    });

    it('should handle long secrets', () => {
      const longSecret = 'A'.repeat(100);

      const encrypted = twoFactorService.encryptSecret(longSecret);
      const decrypted = twoFactorService.decryptSecret(encrypted);

      expect(decrypted).toBe(longSecret);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => {
        twoFactorService.decryptSecret('invalid-format');
      }).toThrow('Invalid encrypted data format');
    });
  });

  describe('generateTempToken', () => {
    it('should generate a temporary JWT token', async () => {
      const user = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
      };

      const token = await twoFactorService.generateTempToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Decode token to verify claims
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.decode(token);

      expect(decoded.id).toBe(user._id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.twoFactorPending).toBe(true);
    });
  });
});
