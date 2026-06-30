import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_PASSWORD_VALIDATION_CONFIG,
  PASSWORD_ENV_KEYS,
  loadPasswordValidationConfigFromEnv,
  resolvePasswordValidationConfig,
} from '../../config/password.config';
import {
  PasswordValidationPipe,
  validatePasswordStrength,
} from './password-validation.pipe';

describe('validatePasswordStrength', () => {
  const config = { ...DEFAULT_PASSWORD_VALIDATION_CONFIG };

  it('accepts a password that meets all default rules', () => {
    expect(validatePasswordStrength('Str0ng!Pass', config)).toEqual([]);
  });

  it('rejects passwords that are too short', () => {
    const errors = validatePasswordStrength('Ab1!', config);
    expect(errors).toContain(
      'Password must be at least 8 characters long',
    );
  });

  it('rejects passwords that exceed max length', () => {
    const errors = validatePasswordStrength('A1!a' + 'x'.repeat(30), config);
    expect(errors).toContain(
      'Password must be at most 32 characters long',
    );
  });

  it('rejects passwords missing an uppercase letter', () => {
    const errors = validatePasswordStrength('weakp@ss1', config);
    expect(errors).toContain(
      'Password must contain at least one uppercase letter',
    );
  });

  it('rejects passwords missing a lowercase letter', () => {
    const errors = validatePasswordStrength('WEAKP@SS1', config);
    expect(errors).toContain(
      'Password must contain at least one lowercase letter',
    );
  });

  it('rejects passwords missing a number', () => {
    const errors = validatePasswordStrength('WeakPass!', config);
    expect(errors).toContain('Password must contain at least one number');
  });

  it('rejects passwords missing a special character', () => {
    const errors = validatePasswordStrength('WeakPass1', config);
    expect(errors).toContain(
      'Password must contain at least one special character',
    );
  });

  it('returns multiple descriptive errors for weak passwords', () => {
    const errors = validatePasswordStrength('weak', config);
    expect(errors.length).toBeGreaterThan(1);
    expect(errors).toEqual(
      expect.arrayContaining([
        'Password must be at least 8 characters long',
        'Password must contain at least one uppercase letter',
        'Password must contain at least one number',
        'Password must contain at least one special character',
      ]),
    );
  });

  it('respects relaxed configuration flags', () => {
    const relaxedConfig = {
      ...config,
      requireUppercase: false,
      requireSpecialChars: false,
    };

    expect(validatePasswordStrength('password1', relaxedConfig)).toEqual([]);
  });
});

describe('loadPasswordValidationConfigFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[PASSWORD_ENV_KEYS.minLength];
    delete process.env[PASSWORD_ENV_KEYS.maxLength];
    delete process.env[PASSWORD_ENV_KEYS.requireUppercase];
    delete process.env[PASSWORD_ENV_KEYS.requireLowercase];
    delete process.env[PASSWORD_ENV_KEYS.requireNumbers];
    delete process.env[PASSWORD_ENV_KEYS.requireSpecialChars];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to secure defaults when env vars are unset', () => {
    expect(loadPasswordValidationConfigFromEnv()).toEqual(
      DEFAULT_PASSWORD_VALIDATION_CONFIG,
    );
  });

  it('reads custom values from process.env', () => {
    process.env[PASSWORD_ENV_KEYS.minLength] = '12';
    process.env[PASSWORD_ENV_KEYS.maxLength] = '64';
    process.env[PASSWORD_ENV_KEYS.requireUppercase] = 'false';
    process.env[PASSWORD_ENV_KEYS.requireLowercase] = '1';
    process.env[PASSWORD_ENV_KEYS.requireNumbers] = 'yes';
    process.env[PASSWORD_ENV_KEYS.requireSpecialChars] = '0';

    expect(loadPasswordValidationConfigFromEnv()).toEqual({
      minLength: 12,
      maxLength: 64,
      requireUppercase: false,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
    });
  });
});

describe('resolvePasswordValidationConfig', () => {
  it('prefers ConfigService values when available', () => {
    const configService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        const values: Record<string, unknown> = {
          'password.minLength': 10,
          'password.maxLength': 40,
          'password.requireUppercase': false,
          'password.requireLowercase': true,
          'password.requireNumbers': true,
          'password.requireSpecialChars': true,
        };
        return values[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    expect(resolvePasswordValidationConfig(configService)).toEqual({
      minLength: 10,
      maxLength: 40,
      requireUppercase: false,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    });
  });
});

describe('PasswordValidationPipe', () => {
  let pipe: PasswordValidationPipe;

  beforeEach(() => {
    pipe = new PasswordValidationPipe(undefined);
  });

  it('passes through valid registration payloads unchanged', () => {
    const payload = {
      email: 'user@example.com',
      password: 'Str0ng!Pass',
      firstName: 'Jane',
      lastName: 'Doe',
      country: 'US',
    };

    expect(pipe.transform(payload)).toBe(payload);
  });

  it('passes through valid reset-password payloads unchanged', () => {
    const payload = {
      token: 'reset-token',
      password: 'Str0ng!Pass',
    };

    expect(pipe.transform(payload)).toBe(payload);
  });

  it('rejects weak passwords with descriptive field errors', () => {
    try {
      pipe.transform({
        email: 'user@example.com',
        password: 'weakpass',
        firstName: 'Jane',
        lastName: 'Doe',
        country: 'US',
      });
      fail('Expected BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        statusCode: number;
        message: string;
        errors: Record<string, string[]>;
      };

      expect(response.statusCode).toBe(400);
      expect(response.message).toBe('Validation failed');
      expect(response.errors.password).toEqual(
        expect.arrayContaining([
          'Password must contain at least one uppercase letter',
          'Password must contain at least one number',
          'Password must contain at least one special character',
        ]),
      );
    }
  });

  it('rejects missing password values', () => {
    expect(() =>
      pipe.transform({
        email: 'user@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        country: 'US',
      }),
    ).toThrow(BadRequestException);

    try {
      pipe.transform({
        email: 'user@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        country: 'US',
      });
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        errors: Record<string, string[]>;
      };
      expect(response.errors.password).toContain('Password is required');
    }
  });

  it('rejects non-string password values', () => {
    try {
      pipe.transform({ password: 12345678 });
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        errors: Record<string, string[]>;
      };
      expect(response.errors.password).toContain('Password must be a string');
    }
  });

  it('rejects invalid request bodies', () => {
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
    expect(() => pipe.transform('not-an-object')).toThrow(BadRequestException);
  });

  it('uses ConfigService-driven rules when injected', () => {
    const configService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'password.minLength') {
          return 12;
        }
        if (key === 'password.requireSpecialChars') {
          return false;
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const configuredPipe = new PasswordValidationPipe(configService);

    expect(
      configuredPipe.transform({ password: 'LongPassword1' }),
    ).toEqual({ password: 'LongPassword1' });

    try {
      configuredPipe.transform({ password: 'Short1' });
      fail('Expected BadRequestException');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        errors: Record<string, string[]>;
      };
      expect(response.errors.password).toContain(
        'Password must be at least 12 characters long',
      );
    }
  });
});
