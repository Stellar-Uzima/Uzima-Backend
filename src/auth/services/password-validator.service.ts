import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Password validation result interface
export interface PasswordValidationResult {
  isValid: boolean;
  errors: PasswordValidationError[];
  score: number; // 0-100 password strength score
}

export interface PasswordValidationError {
  type: PasswordErrorType;
  message: string;
  severity: 'error' | 'warning';
}

export enum PasswordErrorType {
  TOO_SHORT = 'TOO_SHORT',
  NO_UPPERCASE = 'NO_UPPERCASE',
  NO_LOWERCASE = 'NO_LOWERCASE',
  NO_NUMBER = 'NO_NUMBER',
  NO_SPECIAL_CHARACTER = 'NO_SPECIAL_CHARACTER',
  COMMON_PASSWORD = 'COMMON_PASSWORD',
  SEQUENTIAL_CHARS = 'SEQUENTIAL_CHARS',
  REPEATED_CHARS = 'REPEATED_CHARS',
  WEAK_PATTERN = 'WEAK_PATTERN',
}

export interface PasswordStrengthConfig {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxConsecutiveRepeats: number;
  enableCommonPasswordCheck: boolean;
  enablePatternCheck: boolean;
}

@ValidatorConstraint({ name: 'strongPassword', async: false })
export class PasswordValidatorService implements ValidatorConstraintInterface {
  private readonly commonPasswords: string[];
  private readonly defaultConfig: PasswordStrengthConfig = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxConsecutiveRepeats: 2,
    enableCommonPasswordCheck: true,
    enablePatternCheck: true,
  };

  constructor() {
    this.commonPasswords = this.getCommonPasswords();
  }

  /**
   * Main validation method for class-validator
   */
  validate(
    password: string,
    validationArguments?: ValidationArguments,
  ): boolean {
    const result = this.validatePassword(password);
    return result.isValid;
  }

  /**
   * Default error message for class-validator
   */
  defaultMessage(validationArguments?: ValidationArguments): string {
    return 'Password does not meet security requirements';
  }

  /**
   * Comprehensive password validation
   */
  validatePassword(
    password: string,
    config?: Partial<PasswordStrengthConfig>,
  ): PasswordValidationResult {
    const finalConfig = { ...this.defaultConfig, ...config };
    const errors: PasswordValidationError[] = [];
    let score = 0;

    // Length validation
    if (password.length < finalConfig.minLength) {
      errors.push({
        type: PasswordErrorType.TOO_SHORT,
        message: `Password must be at least ${finalConfig.minLength} characters long`,
        severity: 'error',
      });
    } else {
      score += Math.min(password.length * 2, 20); // Max 20 points for length
    }

    // Uppercase validation
    if (finalConfig.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push({
        type: PasswordErrorType.NO_UPPERCASE,
        message: 'Password must contain at least one uppercase letter',
        severity: 'error',
      });
    } else if (/[A-Z]/.test(password)) {
      score += 15;
    }

    // Lowercase validation
    if (finalConfig.requireLowercase && !/[a-z]/.test(password)) {
      errors.push({
        type: PasswordErrorType.NO_LOWERCASE,
        message: 'Password must contain at least one lowercase letter',
        severity: 'error',
      });
    } else if (/[a-z]/.test(password)) {
      score += 15;
    }

    // Number validation
    if (finalConfig.requireNumbers && !/\d/.test(password)) {
      errors.push({
        type: PasswordErrorType.NO_NUMBER,
        message: 'Password must contain at least one number',
        severity: 'error',
      });
    } else if (/\d/.test(password)) {
      score += 15;
    }

    // Special character validation
    if (
      finalConfig.requireSpecialChars &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    ) {
      errors.push({
        type: PasswordErrorType.NO_SPECIAL_CHARACTER,
        message: 'Password must contain at least one special character',
        severity: 'error',
      });
    } else if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 15;
    }

    // Common password check
    if (
      finalConfig.enableCommonPasswordCheck &&
      this.isCommonPassword(password)
    ) {
      errors.push({
        type: PasswordErrorType.COMMON_PASSWORD,
        message: 'Password is too common and easily guessable',
        severity: 'error',
      });
    }

    // Pattern checks (warnings)
    if (finalConfig.enablePatternCheck) {
      // Sequential characters check
      if (this.hasSequentialChars(password)) {
        errors.push({
          type: PasswordErrorType.SEQUENTIAL_CHARS,
          message: 'Password contains sequential characters',
          severity: 'warning',
        });
        score -= 10;
      }

      // Repeated characters check
      if (this.hasRepeatedChars(password, finalConfig.maxConsecutiveRepeats)) {
        errors.push({
          type: PasswordErrorType.REPEATED_CHARS,
          message: `Password contains too many repeated characters (max ${finalConfig.maxConsecutiveRepeats})`,
          severity: 'warning',
        });
        score -= 10;
      }

      // Weak pattern check
      if (this.hasWeakPattern(password)) {
        errors.push({
          type: PasswordErrorType.WEAK_PATTERN,
          message: 'Password follows a weak pattern (e.g., "password123")',
          severity: 'warning',
        });
        score -= 15;
      }
    }

    // Bonus points for complexity
    const uniqueChars = new Set(password).size;
    if (uniqueChars >= password.length * 0.7) {
      score += 10; // Bonus for character diversity
    }

    // Ensure score is within 0-100 range
    score = Math.max(0, Math.min(100, score));

    const isValid =
      errors.filter((error) => error.severity === 'error').length === 0;

    return {
      isValid,
      errors,
      score,
    };
  }

  /**
   * Quick validation check (boolean only)
   */
  isStrongPassword(
    password: string,
    config?: Partial<PasswordStrengthConfig>,
  ): boolean {
    return this.validatePassword(password, config).isValid;
  }

  /**
   * Get password strength score (0-100)
   */
  getPasswordStrength(password: string): number {
    return this.validatePassword(password).score;
  }

  /**
   * Get password strength category
   */
  getPasswordStrengthCategory(
    password: string,
  ): 'very_weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very_strong' {
    const score = this.getPasswordStrength(password);

    if (score < 20) return 'very_weak';
    if (score < 40) return 'weak';
    if (score < 60) return 'fair';
    if (score < 80) return 'good';
    if (score < 90) return 'strong';
    return 'very_strong';
  }

  /**
   * Check if password is in the common passwords list
   */
  private isCommonPassword(password: string): boolean {
    const lowerPassword = password.toLowerCase();
    return (
      this.commonPasswords.includes(lowerPassword) ||
      this.commonPasswords.some((common) => lowerPassword.includes(common))
    );
  }

  /**
   * Check for sequential characters (e.g., "abc", "123", "qwe")
   */
  private hasSequentialChars(password: string): boolean {
    for (let i = 0; i < password.length - 2; i++) {
      const char1 = password.charCodeAt(i);
      const char2 = password.charCodeAt(i + 1);
      const char3 = password.charCodeAt(i + 2);

      // Check for ascending sequence
      if (char2 === char1 + 1 && char3 === char2 + 1) {
        return true;
      }

      // Check for descending sequence
      if (char2 === char1 - 1 && char3 === char2 - 1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check for repeated characters
   */
  private hasRepeatedChars(password: string, maxRepeats: number): boolean {
    let repeatCount = 1;

    for (let i = 1; i < password.length; i++) {
      if (password[i] === password[i - 1]) {
        repeatCount++;
        if (repeatCount > maxRepeats) {
          return true;
        }
      } else {
        repeatCount = 1;
      }
    }
    return false;
  }

  /**
   * Check for weak patterns (e.g., "password", "qwerty", "admin")
   */
  private hasWeakPattern(password: string): boolean {
    const lowerPassword = password.toLowerCase();
    const weakPatterns = [
      'password',
      'qwerty',
      'admin',
      'user',
      'login',
      'welcome',
      'letmein',
      '123456',
      '12345678',
      '123456789',
      '1234567890',
    ];

    return weakPatterns.some((pattern) => lowerPassword.includes(pattern));
  }

  /**
   * Get list of common passwords (top 100)
   */
  private getCommonPasswords(): string[] {
    return [
      '123456',
      'password',
      '12345678',
      'qwerty',
      '123456789',
      '12345',
      '1234',
      '111111',
      '1234567',
      'dragon',
      '1234567890',
      'master',
      'hello',
      'freedom',
      'whatever',
      'qazwsx',
      'trustno1',
      '123qwe',
      '1q2w3e4r',
      'zxcvbnm',
      '1qaz2wsx',
      'admin',
      'welcome',
      'monkey',
      'login',
      'letmein',
      'abc123',
      'password1',
      '123123',
      'dragon1',
      'passw0rd',
      'master1',
      'hello1',
      'freedom1',
      'whatever1',
      'qazwsx1',
      'trustno11',
      '123qwe1',
      '1q2w3e4r1',
      'zxcvbnm1',
      '1qaz2wsx1',
      'admin1',
      'welcome1',
      'monkey1',
      'login1',
      'letmein1',
      'abc1231',
      'password2',
      '1231232',
      'dragon2',
      'passw0rd2',
      'master2',
      'hello2',
      'freedom2',
      'whatever2',
      'qazwsx2',
      'trustno12',
      '123qwe2',
      '1q2w3e4r2',
      'zxcvbnm2',
      '1qaz2wsx2',
      'admin2',
      'welcome2',
      'monkey2',
      'login2',
      'letmein2',
      'abc1232',
      'password123',
      '1231233',
      'dragon3',
      'passw0rd3',
      'master3',
      'hello3',
      'freedom3',
      'whatever3',
      'qazwsx3',
      'trustno13',
      '123qwe3',
      '1q2w3e4r3',
      'zxcvbnm3',
      '1qaz2wsx3',
      'admin3',
      'welcome3',
      'monkey3',
      'login3',
      'letmein3',
      'abc1233',
      'password!',
      '1231234',
      'dragon4',
      'passw0rd!',
      'master4',
      'hello4',
      'freedom4',
      'whatever4',
      'qazwsx4',
      'trustno14',
      '123qwe4',
      '1q2w3e4r4',
      'zxcvbnm4',
      '1qaz2wsx4',
      'admin4',
      'welcome4',
      'monkey4',
      'login4',
      'letmein4',
      'abc1234',
      'password12',
      '1231235',
      'dragon5',
      'passw0rd12',
      'master5',
      'hello5',
      'freedom5',
      'whatever5',
      'qazwsx5',
      'trustno15',
      '123qwe5',
      '1q2w3e4r5',
      'zxcvbnm5',
      '1qaz2wsx5',
      'admin5',
      'welcome5',
      'monkey5',
      'login5',
      'letmein5',
      'abc1235',
      'password123!',
      '1231236',
      'dragon6',
      'passw0rd123',
      'master6',
      'hello6',
      'freedom6',
      'whatever6',
      'qazwsx6',
      'trustno16',
      '123qwe6',
      '1q2w3e4r6',
      'zxcvbnm6',
      '1qaz2wsx6',
      'admin6',
      'welcome6',
      'monkey6',
      'login6',
      'letmein6',
      'abc1236',
    ];
  }

  /**
   * Generate password suggestions based on requirements
   */
  generatePasswordSuggestions(length: number = 12): string[] {
    const suggestions: string[] = [];
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const allChars = uppercase + lowercase + numbers + special;

    for (let i = 0; i < 5; i++) {
      let password = '';
      const chars = allChars.split('');

      // Ensure at least one of each required type
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      password += numbers[Math.floor(Math.random() * numbers.length)];
      password += special[Math.floor(Math.random() * special.length)];

      // Fill remaining characters
      for (let j = 4; j < length; j++) {
        password += chars[Math.floor(Math.random() * chars.length)];
      }

      // Shuffle the password
      password = password
        .split('')
        .sort(() => Math.random() - 0.5)
        .join('');
      suggestions.push(password);
    }

    return suggestions;
  }
}
