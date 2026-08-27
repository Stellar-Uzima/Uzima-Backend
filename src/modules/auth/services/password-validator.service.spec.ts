import {
  PasswordValidatorService,
  PasswordErrorType,
  PasswordStrengthConfig,
} from './password-validator.service';

describe('PasswordValidatorService', () => {
  let service: PasswordValidatorService;

  beforeEach(() => {
    service = new PasswordValidatorService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Basic Password Validation', () => {
    it('should validate a strong password', () => {
      const result = service.validatePassword('StrongP@ssw0rd!');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should reject password that is too short', () => {
      const result = service.validatePassword('Ab1!');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.TOO_SHORT),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('at least 8 characters')),
      ).toBe(true);
    });

    it('should reject password without uppercase letter', () => {
      const result = service.validatePassword('weakp@ssw0rd!');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_UPPERCASE),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('uppercase letter')),
      ).toBe(true);
    });

    it('should reject password without lowercase letter', () => {
      const result = service.validatePassword('WEAKP@SSW0RD!');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_LOWERCASE),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('lowercase letter')),
      ).toBe(true);
    });

    it('should reject password without number', () => {
      const result = service.validatePassword('WeakPassword!');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_NUMBER),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('at least one number')),
      ).toBe(true);
    });

    it('should reject password without special character', () => {
      const result = service.validatePassword('WeakPassword123');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.type === PasswordErrorType.NO_SPECIAL_CHARACTER,
        ),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('special character')),
      ).toBe(true);
    });
  });

  describe('Common Password Detection', () => {
    it('should reject common passwords', () => {
      const commonPasswords = [
        '123456',
        'password',
        'qwerty',
        'admin',
        '12345678',
        'abc123',
      ];

      commonPasswords.forEach((password) => {
        const result = service.validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(
          result.errors.some(
            (e) => e.type === PasswordErrorType.COMMON_PASSWORD,
          ),
        ).toBe(true);
      });
    });

    it('should reject variations of common passwords', () => {
      const variations = [
        'Password123!',
        'Qwerty123!',
        'Admin123!',
        '12345678!',
      ];

      variations.forEach((password) => {
        const result = service.validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(
          result.errors.some(
            (e) => e.type === PasswordErrorType.COMMON_PASSWORD,
          ),
        ).toBe(true);
      });
    });

    it('should accept uncommon but similar passwords', () => {
      const acceptablePasswords = [
        'MySecureP@ssw0rd!',
        'ComplexP@ssword123',
        'R@ndomString456!',
      ];

      acceptablePasswords.forEach((password) => {
        const result = service.validatePassword(password);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Pattern Detection', () => {
    it('should warn about sequential characters', () => {
      const sequentialPasswords = ['Abcdefgh1!', '12345678!', 'Qwertyui1!'];

      sequentialPasswords.forEach((password) => {
        const result = service.validatePassword(password);
        expect(
          result.errors.some(
            (e) => e.type === PasswordErrorType.SEQUENTIAL_CHARS,
          ),
        ).toBe(true);
        expect(
          result.errors.filter(
            (e) => e.type === PasswordErrorType.SEQUENTIAL_CHARS,
          )[0].severity,
        ).toBe('warning');
      });
    });

    it('should warn about repeated characters', () => {
      const repeatedPasswords = [
        'AAAbbb111!!!',
        'Passwordddd123!',
        'Secureeeeee1!',
      ];

      repeatedPasswords.forEach((password) => {
        const result = service.validatePassword(password);
        expect(
          result.errors.some(
            (e) => e.type === PasswordErrorType.REPEATED_CHARS,
          ),
        ).toBe(true);
        expect(
          result.errors.filter(
            (e) => e.type === PasswordErrorType.REPEATED_CHARS,
          )[0].severity,
        ).toBe('warning');
      });
    });

    it('should warn about weak patterns', () => {
      const weakPatternPasswords = [
        'password123!',
        'qwerty123!',
        'admin123!',
        'welcome123!',
      ];

      weakPatternPasswords.forEach((password) => {
        const result = service.validatePassword(password);
        expect(
          result.errors.some((e) => e.type === PasswordErrorType.WEAK_PATTERN),
        ).toBe(true);
        expect(
          result.errors.filter(
            (e) => e.type === PasswordErrorType.WEAK_PATTERN,
          )[0].severity,
        ).toBe('warning');
      });
    });
  });

  describe('Password Strength Scoring', () => {
    it('should calculate high score for strong passwords', () => {
      const strongPasswords = [
        'MySecureP@ssw0rd!',
        'ComplexP@ssword123!',
        'R@ndom#String456',
      ];

      strongPasswords.forEach((password) => {
        const score = service.getPasswordStrength(password);
        expect(score).toBeGreaterThan(80);
      });
    });

    it('should calculate low score for weak passwords', () => {
      const weakPasswords = ['weak123', 'simple', '123456'];

      weakPasswords.forEach((password) => {
        const score = service.getPasswordStrength(password);
        expect(score).toBeLessThan(40);
      });
    });

    it('should categorize password strength correctly', () => {
      expect(service.getPasswordStrengthCategory('123')).toBe('very_weak');
      expect(service.getPasswordStrengthCategory('weak123')).toBe('weak');
      expect(service.getPasswordStrengthCategory('Password123')).toBe('fair');
      expect(service.getPasswordStrengthCategory('Password123!')).toBe('good');
      expect(service.getPasswordStrengthCategory('SecureP@ssw0rd!')).toBe(
        'strong',
      );
      expect(
        service.getPasswordStrengthCategory('VerySecureP@ssw0rd123!'),
      ).toBe('very_strong');
    });
  });

  describe('Custom Configuration', () => {
    it('should respect custom minimum length', () => {
      const config: Partial<PasswordStrengthConfig> = { minLength: 12 };
      const result = service.validatePassword('Abc123!', config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.type === PasswordErrorType.TOO_SHORT &&
            e.message.includes('12 characters'),
        ),
      ).toBe(true);
    });

    it('should allow disabling requirements', () => {
      const config: Partial<PasswordStrengthConfig> = {
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
      };

      const result = service.validatePassword('longenough', config);
      expect(result.isValid).toBe(true);
    });

    it('should respect custom max consecutive repeats', () => {
      const config: Partial<PasswordStrengthConfig> = {
        maxConsecutiveRepeats: 1,
      };
      const result = service.validatePassword('AAAbbb123!', config);

      expect(
        result.errors.some((e) => e.type === PasswordErrorType.REPEATED_CHARS),
      ).toBe(true);
    });

    it('should allow disabling common password check', () => {
      const config: Partial<PasswordStrengthConfig> = {
        enableCommonPasswordCheck: false,
      };
      const result = service.validatePassword('password123!', config);

      expect(
        result.errors.some((e) => e.type === PasswordErrorType.COMMON_PASSWORD),
      ).toBe(false);
    });

    it('should allow disabling pattern check', () => {
      const config: Partial<PasswordStrengthConfig> = {
        enablePatternCheck: false,
      };
      const result = service.validatePassword('abcdefg123!', config);

      expect(
        result.errors.some(
          (e) => e.type === PasswordErrorType.SEQUENTIAL_CHARS,
        ),
      ).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.WEAK_PATTERN),
      ).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    it('should return boolean for isStrongPassword', () => {
      expect(service.isStrongPassword('StrongP@ssw0rd!')).toBe(true);
      expect(service.isStrongPassword('weak')).toBe(false);
    });

    it('should return score for getPasswordStrength', () => {
      const score = service.getPasswordStrength('StrongP@ssw0rd!');
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should generate password suggestions', () => {
      const suggestions = service.generatePasswordSuggestions();

      expect(suggestions).toHaveLength(5);
      suggestions.forEach((password) => {
        expect(password.length).toBeGreaterThanOrEqual(12);
        expect(service.isStrongPassword(password)).toBe(true);
      });
    });

    it('should generate password suggestions with custom length', () => {
      const suggestions = service.generatePasswordSuggestions(16);

      expect(suggestions).toHaveLength(5);
      suggestions.forEach((password) => {
        expect(password.length).toBe(16);
        expect(service.isStrongPassword(password)).toBe(true);
      });
    });
  });

  describe('Class Validator Integration', () => {
    it('should work with class-validator validate method', () => {
      // Test the class-validator interface
      const result = service.validate('StrongP@ssw0rd!');
      expect(result).toBe(true);

      const invalidResult = service.validate('weak');
      expect(invalidResult).toBe(false);
    });

    it('should provide default error message', () => {
      const message = service.defaultMessage();
      expect(message).toBe('Password does not meet security requirements');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty password', () => {
      const result = service.validatePassword('');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.TOO_SHORT),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_UPPERCASE),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_LOWERCASE),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_NUMBER),
      ).toBe(true);
      expect(
        result.errors.some(
          (e) => e.type === PasswordErrorType.NO_SPECIAL_CHARACTER,
        ),
      ).toBe(true);
    });

    it('should handle password with only special characters', () => {
      const result = service.validatePassword('!@#$%^&*()');

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_UPPERCASE),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_LOWERCASE),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.type === PasswordErrorType.NO_NUMBER),
      ).toBe(true);
    });

    it('should handle password with unicode characters', () => {
      const result = service.validatePassword('Pássw0rd!ñ');

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(60);
    });

    it('should handle very long passwords', () => {
      const longPassword = 'VeryLongSecureP@ssw0rd123456789!';
      const result = service.validatePassword(longPassword);

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(80);
    });
  });

  describe('Error Message Specificity', () => {
    it('should provide specific error messages for each failure', () => {
      const result = service.validatePassword('weak');

      const errorTypes = result.errors.map((e) => e.type);
      const errorMessages = result.errors.map((e) => e.message);

      expect(errorTypes).toContain(PasswordErrorType.TOO_SHORT);
      expect(errorTypes).toContain(PasswordErrorType.NO_UPPERCASE);
      expect(errorTypes).toContain(PasswordErrorType.NO_LOWERCASE);
      expect(errorTypes).toContain(PasswordErrorType.NO_NUMBER);
      expect(errorTypes).toContain(PasswordErrorType.NO_SPECIAL_CHARACTER);

      expect(errorMessages.some((msg) => msg.includes('8 characters'))).toBe(
        true,
      );
      expect(errorMessages.some((msg) => msg.includes('uppercase'))).toBe(true);
      expect(errorMessages.some((msg) => msg.includes('lowercase'))).toBe(true);
      expect(errorMessages.some((msg) => msg.includes('number'))).toBe(true);
      expect(
        errorMessages.some((msg) => msg.includes('special character')),
      ).toBe(true);
    });

    it('should distinguish between errors and warnings', () => {
      const result = service.validatePassword('Abcdefgh1!');

      const errors = result.errors.filter((e) => e.severity === 'error');
      const warnings = result.errors.filter((e) => e.severity === 'warning');

      expect(errors.length).toBe(0); // Should pass all error checks
      expect(warnings.length).toBeGreaterThan(0); // Should have warnings for patterns
    });
  });
});
