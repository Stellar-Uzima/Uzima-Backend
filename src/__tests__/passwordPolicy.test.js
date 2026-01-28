/* eslint-disable prettier/prettier */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import {
  validatePasswordComplexity,
  checkPasswordBreach,
  calculatePasswordStrength,
  checkPasswordNotInHistory,
  validatePassword,
  PASSWORD_REQUIREMENTS,
} from '../utils/passwordValidator.js';
import PasswordPolicyService from '../services/passwordPolicyService.js';

describe('Password Validator Utility', () => {
  describe('validatePasswordComplexity', () => {
    it('should reject password without minimum length', () => {
      const result = validatePasswordComplexity('Pass1!');
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain('at least 8 characters');
    });

    it('should reject password without uppercase', () => {
      const result = validatePasswordComplexity('password123!');
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain('uppercase letter');
    });

    it('should reject password without lowercase', () => {
      const result = validatePasswordComplexity('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain('lowercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePasswordComplexity('PasswordTest!');
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain('number');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordComplexity('Password123');
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain('special character');
    });

    it('should accept valid strong password', () => {
      const result = validatePasswordComplexity('ValidP@ss123');
      expect(result.valid).toBe(true);
      expect(result.feedback).toHaveLength(0);
    });

    it('should reject password exceeding max length', () => {
      const longPassword = 'ValidP@ss123' + 'a'.repeat(60);
      const result = validatePasswordComplexity(longPassword);
      expect(result.valid).toBe(false);
      expect(result.feedback).toContain('exceed 64 characters');
    });
  });

  describe('calculatePasswordStrength', () => {
    it('should return score 0 for empty password', () => {
      const result = calculatePasswordStrength('');
      expect(result.score).toBe(0);
      expect(result.feedback).toContain('Very weak');
    });

    it('should return low score for weak password', () => {
      const result = calculatePasswordStrength('password');
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should return high score for strong password', () => {
      const result = calculatePasswordStrength('StrongP@ssw0rd!');
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('should return max score 4', () => {
      const result = calculatePasswordStrength('VeryStr0ng!P@ssw0rd!123');
      expect(result.score).toBeLessThanOrEqual(4);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should include suggestions for weak password', () => {
      const result = calculatePasswordStrength('weak');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('checkPasswordNotInHistory', () => {
    it('should return true for empty history', async () => {
      const result = await checkPasswordNotInHistory('NewP@ssword123', []);
      expect(result).toBe(true);
    });

    it('should return false if password exists in history', async () => {
      const password = 'OldP@ssword123';
      const hash = await bcrypt.hash(password, 10);
      const history = [{ hash, changedAt: new Date() }];

      const result = await checkPasswordNotInHistory(password, history);
      expect(result).toBe(false);
    });

    it('should return true if password not in history', async () => {
      const oldPassword = 'OldP@ssword123';
      const newPassword = 'NewP@ssword123';
      const hash = await bcrypt.hash(oldPassword, 10);
      const history = [{ hash, changedAt: new Date() }];

      const result = await checkPasswordNotInHistory(newPassword, history);
      expect(result).toBe(true);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong password with no issues', async () => {
      const result = await validatePassword('ValidP@ss123', [], 'testuser', 'test@example.com');
      expect(result.valid).toBe(true);
      expect(result.feedback).toHaveLength(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should reject password containing username', async () => {
      const result = await validatePassword(
        'TestUserP@ss123',
        [],
        'testuser',
        'test@example.com'
      );
      expect(result.valid).toBe(false);
      expect(result.feedback.some(f => f.includes('username'))).toBe(true);
    });

    it('should reject password containing email', async () => {
      const result = await validatePassword(
        'Testp@ss123@example.com',
        [],
        'testuser',
        'test@example.com'
      );
      expect(result.valid).toBe(false);
      expect(result.feedback.some(f => f.includes('email'))).toBe(true);
    });

    it('should include strength score in response', async () => {
      const result = await validatePassword('ValidP@ss123', [], 'user', 'user@test.com');
      expect(result.score).toBeDefined();
      expect(result.scoreDetails).toBeDefined();
      expect(result.scoreDetails.feedback).toBeDefined();
    });
  });
});

describe('Password Policy Service', () => {
  let mockUser;

  beforeEach(() => {
    mockUser = {
      _id: 'test-user-id',
      username: 'testuser',
      password: 'HashedPassword123',
      security: {
        loginAttempts: 0,
        lockUntil: undefined,
        passwordChangedAt: new Date(),
        passwordExpiresAt: undefined,
        requirePasswordChange: false,
        passwordHistory: [],
      },
    };
  });

  describe('Password History Management', () => {
    it('should add password to history', async () => {
      const newHash = 'NewHashedPassword';
      await PasswordPolicyService.addToPasswordHistory(mockUser, newHash);

      expect(mockUser.security.passwordHistory).toHaveLength(1);
      expect(mockUser.security.passwordHistory[0].hash).toBe(newHash);
    });

    it('should maintain only last 5 passwords', async () => {
      for (let i = 0; i < 7; i++) {
        await PasswordPolicyService.addToPasswordHistory(mockUser, `Hash${i}`);
      }

      expect(mockUser.security.passwordHistory).toHaveLength(5);
      expect(mockUser.security.passwordHistory[0].hash).toBe('Hash2');
      expect(mockUser.security.passwordHistory[4].hash).toBe('Hash6');
    });
  });

  describe('Password Expiry Management', () => {
    it('should set password expiry to 90 days from now', () => {
      PasswordPolicyService.setPasswordExpiry(mockUser);

      expect(mockUser.security.passwordExpiresAt).toBeDefined();
      const daysUntilExpiry = PasswordPolicyService.getDaysUntilExpiry(mockUser);
      expect(daysUntilExpiry).toBeGreaterThanOrEqual(89);
      expect(daysUntilExpiry).toBeLessThanOrEqual(91);
    });

    it('should identify expired password', () => {
      mockUser.security.passwordExpiresAt = new Date(Date.now() - 1000);
      expect(PasswordPolicyService.isPasswordExpired(mockUser)).toBe(true);
    });

    it('should identify non-expired password', () => {
      mockUser.security.passwordExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expect(PasswordPolicyService.isPasswordExpired(mockUser)).toBe(false);
    });

    it('should return days until expiry', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockUser.security.passwordExpiresAt = futureDate;

      const daysRemaining = PasswordPolicyService.getDaysUntilExpiry(mockUser);
      expect(daysRemaining).toBeGreaterThanOrEqual(29);
      expect(daysRemaining).toBeLessThanOrEqual(31);
    });

    it('should return correct expiry warning level', () => {
      // Danger: 7 days or less
      let futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      mockUser.security.passwordExpiresAt = futureDate;
      expect(PasswordPolicyService.getExpiryWarningLevel(mockUser)).toBe('danger');

      // Warning: 14 days or less
      futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      mockUser.security.passwordExpiresAt = futureDate;
      expect(PasswordPolicyService.getExpiryWarningLevel(mockUser)).toBe('warning');

      // Info: 30 days or less
      futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      mockUser.security.passwordExpiresAt = futureDate;
      expect(PasswordPolicyService.getExpiryWarningLevel(mockUser)).toBe('info');

      // No warning
      futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      mockUser.security.passwordExpiresAt = futureDate;
      expect(PasswordPolicyService.getExpiryWarningLevel(mockUser)).toBeNull();
    });
  });

  describe('Force Password Change', () => {
    it('should mark user to require password change', () => {
      mockUser.security.requirePasswordChange = false;
      PasswordPolicyService.forcePasswordChange(mockUser);
      expect(mockUser.security.requirePasswordChange).toBe(true);
    });

    it('should clear force password change flag', () => {
      mockUser.security.requirePasswordChange = true;
      PasswordPolicyService.clearForcePasswordChange(mockUser);
      expect(mockUser.security.requirePasswordChange).toBe(false);
    });
  });

  describe('Account Lockout Management', () => {
    it('should handle failed login attempt', () => {
      const locked = PasswordPolicyService.handleFailedLoginAttempt(mockUser, 3, 15);
      expect(mockUser.security.loginAttempts).toBe(1);
      expect(locked).toBe(false);
    });

    it('should lock account after max attempts', () => {
      const locked1 = PasswordPolicyService.handleFailedLoginAttempt(mockUser, 2, 15);
      const locked2 = PasswordPolicyService.handleFailedLoginAttempt(mockUser, 2, 15);

      expect(locked1).toBe(false);
      expect(locked2).toBe(true);
      expect(mockUser.security.lockUntil).toBeDefined();
    });

    it('should identify locked account', () => {
      mockUser.security.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
      expect(PasswordPolicyService.isAccountLocked(mockUser)).toBe(true);
    });

    it('should identify unlocked account', () => {
      mockUser.security.lockUntil = new Date(Date.now() - 10 * 60 * 1000);
      expect(PasswordPolicyService.isAccountLocked(mockUser)).toBe(false);
    });

    it('should reset failed login attempts', () => {
      mockUser.security.loginAttempts = 5;
      mockUser.security.lockUntil = new Date();

      PasswordPolicyService.resetFailedLoginAttempts(mockUser);

      expect(mockUser.security.loginAttempts).toBe(0);
      expect(mockUser.security.lockUntil).toBeUndefined();
    });

    it('should return lock time remaining in minutes', () => {
      mockUser.security.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
      const remaining = PasswordPolicyService.getLockTimeRemaining(mockUser);

      expect(remaining).toBeGreaterThanOrEqual(9);
      expect(remaining).toBeLessThanOrEqual(11);
    });
  });

  describe('Password Status', () => {
    it('should return comprehensive password status', () => {
      mockUser.security.passwordExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const status = PasswordPolicyService.getPasswordStatus(mockUser);

      expect(status).toHaveProperty('isExpired');
      expect(status).toHaveProperty('daysUntilExpiry');
      expect(status).toHaveProperty('requiresChange');
      expect(status).toHaveProperty('expiryWarning');
      expect(status).toHaveProperty('isLocked');
      expect(status).toHaveProperty('lockTimeRemaining');
      expect(status).toHaveProperty('lastChanged');
      expect(status).toHaveProperty('expiresAt');
      expect(status).toHaveProperty('historyCount');
      expect(status).toHaveProperty('maxHistoryCount');
    });
  });

  describe('Update Password', () => {
    it('should update password and set expiry', async () => {
      const oldPassword = mockUser.password;
      const newHash = 'NewHashedPassword123';

      await PasswordPolicyService.updatePassword(mockUser, newHash);

      expect(mockUser.password).toBe(newHash);
      expect(mockUser.security.passwordChangedAt).toBeDefined();
      expect(mockUser.security.passwordExpiresAt).toBeDefined();
      expect(mockUser.security.passwordHistory).toContainEqual(
        expect.objectContaining({ hash: oldPassword })
      );
    });

    it('should clear force change flag after password update', async () => {
      mockUser.security.requirePasswordChange = true;

      await PasswordPolicyService.updatePassword(mockUser, 'NewHash');

      expect(mockUser.security.requirePasswordChange).toBe(false);
    });

    it('should reset login attempts after password update', async () => {
      mockUser.security.loginAttempts = 5;

      await PasswordPolicyService.updatePassword(mockUser, 'NewHash');

      expect(mockUser.security.loginAttempts).toBe(0);
    });
  });

  describe('Policy Constants', () => {
    it('should return policy configuration', () => {
      const policy = PasswordPolicyService.getPolicy();

      expect(policy).toHaveProperty('EXPIRY_DAYS');
      expect(policy).toHaveProperty('HISTORY_COUNT');
      expect(policy.EXPIRY_DAYS).toBe(90);
      expect(policy.HISTORY_COUNT).toBe(5);
    });
  });
});

describe('Password Requirements Constants', () => {
  it('should have correct minimum length', () => {
    expect(PASSWORD_REQUIREMENTS.MIN_LENGTH).toBe(8);
  });

  it('should have correct maximum length', () => {
    expect(PASSWORD_REQUIREMENTS.MAX_LENGTH).toBe(64);
  });

  it('should require uppercase', () => {
    expect(PASSWORD_REQUIREMENTS.REQUIRE_UPPERCASE).toBe(true);
  });

  it('should require lowercase', () => {
    expect(PASSWORD_REQUIREMENTS.REQUIRE_LOWERCASE).toBe(true);
  });

  it('should require number', () => {
    expect(PASSWORD_REQUIREMENTS.REQUIRE_NUMBER).toBe(true);
  });

  it('should require special character', () => {
    expect(PASSWORD_REQUIREMENTS.REQUIRE_SPECIAL_CHAR).toBe(true);
  });
});
