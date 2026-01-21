import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import User from '../models/User.js';
import * as twoFactorService from '../services/twoFactorService.js';


let mongoServer;
let testUser;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  // Clear database and create a test user
  await User.deleteMany({});
  
  const hashedPassword = await bcrypt.hash('Test1234!', 10);
  testUser = await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: hashedPassword,
    role: 'patient',
  });
});

describe('Two-Factor Authentication Database Integration Tests', () => {
  describe('2FA Setup Flow', () => {
    it('should store encrypted TOTP secret in database', async () => {
      const { secret } = twoFactorService.generateSecret();
      const encryptedSecret = twoFactorService.encryptSecret(secret);

      testUser.twoFactor = {
        enabled: false,
        secret: encryptedSecret,
        algorithm: 'sha1',
        encoding: 'base32',
        backupCodes: [],
      };

      await testUser.save();

      const savedUser = await User.findById(testUser._id);
      expect(savedUser.twoFactor.secret).toBeDefined();
      expect(savedUser.twoFactor.enabled).toBe(false);

      // Verify we can decrypt it
      const decrypted = twoFactorService.decryptSecret(savedUser.twoFactor.secret);
      expect(decrypted).toBe(secret);
    });

    it('should enable 2FA and store backup codes', async () => {
      const { secret } = twoFactorService.generateSecret();
      const encryptedSecret = twoFactorService.encryptSecret(secret);

      // Generate and hash backup codes
      const backupCodes = twoFactorService.generateBackupCodes();
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(async code => ({
          code: await twoFactorService.hashBackupCode(code),
          usedAt: null,
          createdAt: new Date(),
        }))
      );

      testUser.twoFactor = {
        enabled: true,
        secret: encryptedSecret,
        algorithm: 'sha1',
        encoding: 'base32',
        verifiedAt: new Date(),
        backupCodes: hashedBackupCodes,
      };

      await testUser.save();

      const savedUser = await User.findById(testUser._id);
      expect(savedUser.twoFactor.enabled).toBe(true);
      expect(savedUser.twoFactor.verifiedAt).toBeDefined();
      expect(savedUser.twoFactor.backupCodes).toHaveLength(8);
    });
  });

  describe('2FA Verification', () => {
    let secret;
    let encryptedSecret;

    beforeEach(async () => {
      // Setup 2FA for user
      const generated = twoFactorService.generateSecret();
      secret = generated.secret;
      encryptedSecret = twoFactorService.encryptSecret(secret);

      const backupCodes = twoFactorService.generateBackupCodes();
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(async code => ({
          code: await twoFactorService.hashBackupCode(code),
          usedAt: null,
          createdAt: new Date(),
        }))
      );

      testUser.twoFactor = {
        enabled: true,
        secret: encryptedSecret,
        algorithm: 'sha1',
        encoding: 'base32',
        verifiedAt: new Date(),
        backupCodes: hashedBackupCodes,
      };

      await testUser.save();
    });

    it('should verify valid TOTP token', () => {
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      const decrypted = twoFactorService.decryptSecret(encryptedSecret);
      
      const verified = twoFactorService.verifyToken(decrypted, token);
      expect(verified).toBe(true);
    });

    it('should reject invalid TOTP token', () => {
      const decrypted = twoFactorService.decryptSecret(encryptedSecret);
      const verified = twoFactorService.verifyToken(decrypted, '000000');
      expect(verified).toBe(false);
    });
  });

  describe('Backup Code Usage', () => {
    let backupCodes;

    beforeEach(async () => {
      // Generate plaintext backup codes
      backupCodes = twoFactorService.generateBackupCodes();
      
      // Hash and store them
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(async code => ({
          code: await twoFactorService.hashBackupCode(code),
          usedAt: null,
          createdAt: new Date(),
        }))
      );

      testUser.twoFactor = {
        enabled: true,
        secret: 'encrypted-secret',
        backupCodes: hashedBackupCodes,
      };

      await testUser.save();
    });

    it('should verify valid backup code', async () => {
      const user = await User.findById(testUser._id);
      const testCode = backupCodes[0];
      
      // Find matching backup code
      let verified = false;
      for (const bc of user.twoFactor.backupCodes) {
        if (bc.usedAt) continue;
        const isValid = await twoFactorService.verifyBackupCode(testCode, bc.code);
        if (isValid) {
          verified = true;
          break;
        }
      }

      expect(verified).toBe(true);
    });

    it('should mark backup code as used', async () => {
      const user = await User.findById(testUser._id);
      const testCode = backupCodes[0];
      
      // Mark first code as used
      for (const bc of user.twoFactor.backupCodes) {
        if (bc.usedAt) continue;
        const isValid = await twoFactorService.verifyBackupCode(testCode, bc.code);
        if (isValid) {
          bc.usedAt = new Date();
          await user.save();
          break;
        }
      }

      const updatedUser = await User.findById(testUser._id);
      const usedCodes = updatedUser.twoFactor.backupCodes.filter(bc => bc.usedAt !== null);
      expect(usedCodes).toHaveLength(1);
    });

    it('should not verify used backup code twice', async () => {
      const user = await User.findById(testUser._id);
      const testCode = backupCodes[0];
      
      // Use the code first time
      for (const bc of user.twoFactor.backupCodes) {
        if (bc.usedAt) continue;
        const isValid = await twoFactorService.verifyBackupCode(testCode, bc.code);
        if (isValid) {
          bc.usedAt = new Date();
          await user.save();
          break;
        }
      }

      // Try to use it again
      const updatedUser = await User.findById(testUser._id);
      let verified = false;
      for (const bc of updatedUser.twoFactor.backupCodes) {
        if (bc.usedAt) continue; // Skip used codes
        const isValid = await twoFactorService.verifyBackupCode(testCode, bc.code);
        if (isValid) {
          verified = true;
          break;
        }
      }

      expect(verified).toBe(false);
    });
  });

  describe('2FA Disable Flow', () => {
    beforeEach(async () => {
      const { secret } = twoFactorService.generateSecret();
      const encryptedSecret = twoFactorService.encryptSecret(secret);

      testUser.twoFactor = {
        enabled: true,
        secret: encryptedSecret,
        algorithm: 'sha1',
        encoding: 'base32',
        verifiedAt: new Date(),
        backupCodes: [],
      };

      await testUser.save();
    });

    it('should clear all 2FA data when disabled', async () => {
      testUser.twoFactor = {
        enabled: false,
        secret: null,
        algorithm: 'sha1',
        encoding: 'base32',
        verifiedAt: null,
        backupCodes: [],
      };

      await testUser.save();

      const savedUser = await User.findById(testUser._id);
      expect(savedUser.twoFactor.enabled).toBe(false);
      expect(savedUser.twoFactor.secret).toBeNull();
      expect(savedUser.twoFactor.verifiedAt).toBeNull();
      expect(savedUser.twoFactor.backupCodes).toHaveLength(0);
    });
  });

  describe('Password Verification for 2FA Operations', () => {
    it('should verify correct password', async () => {
      const isMatch = await bcrypt.compare('Test1234!', testUser.password);
      expect(isMatch).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const isMatch = await bcrypt.compare('WrongPassword!', testUser.password);
      expect(isMatch).toBe(false);
    });
  });
});

