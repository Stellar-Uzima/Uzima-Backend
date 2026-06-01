import { ConfigService, registerAs } from '@nestjs/config';

export interface PasswordValidationConfig {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export const PASSWORD_ENV_KEYS = {
  minLength: 'PASSWORD_MIN_LENGTH',
  maxLength: 'PASSWORD_MAX_LENGTH',
  requireUppercase: 'PASSWORD_REQUIRE_UPPERCASE',
  requireLowercase: 'PASSWORD_REQUIRE_LOWERCASE',
  requireNumbers: 'PASSWORD_REQUIRE_NUMBERS',
  requireSpecialChars: 'PASSWORD_REQUIRE_SPECIAL_CHARS',
} as const;

export const DEFAULT_PASSWORD_VALIDATION_CONFIG: PasswordValidationConfig = {
  minLength: 8,
  maxLength: 32,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export function parseBooleanEnv(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

export function parseIntEnv(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function loadPasswordValidationConfigFromEnv(): PasswordValidationConfig {
  return {
    minLength: parseIntEnv(
      process.env[PASSWORD_ENV_KEYS.minLength],
      DEFAULT_PASSWORD_VALIDATION_CONFIG.minLength,
    ),
    maxLength: parseIntEnv(
      process.env[PASSWORD_ENV_KEYS.maxLength],
      DEFAULT_PASSWORD_VALIDATION_CONFIG.maxLength,
    ),
    requireUppercase: parseBooleanEnv(
      process.env[PASSWORD_ENV_KEYS.requireUppercase],
      DEFAULT_PASSWORD_VALIDATION_CONFIG.requireUppercase,
    ),
    requireLowercase: parseBooleanEnv(
      process.env[PASSWORD_ENV_KEYS.requireLowercase],
      DEFAULT_PASSWORD_VALIDATION_CONFIG.requireLowercase,
    ),
    requireNumbers: parseBooleanEnv(
      process.env[PASSWORD_ENV_KEYS.requireNumbers],
      DEFAULT_PASSWORD_VALIDATION_CONFIG.requireNumbers,
    ),
    requireSpecialChars: parseBooleanEnv(
      process.env[PASSWORD_ENV_KEYS.requireSpecialChars],
      DEFAULT_PASSWORD_VALIDATION_CONFIG.requireSpecialChars,
    ),
  };
}

export function resolvePasswordValidationConfig(
  configService?: ConfigService,
): PasswordValidationConfig {
  if (configService) {
    return {
      minLength: configService.get<number>(
        'password.minLength',
        DEFAULT_PASSWORD_VALIDATION_CONFIG.minLength,
      ),
      maxLength: configService.get<number>(
        'password.maxLength',
        DEFAULT_PASSWORD_VALIDATION_CONFIG.maxLength,
      ),
      requireUppercase: configService.get<boolean>(
        'password.requireUppercase',
        DEFAULT_PASSWORD_VALIDATION_CONFIG.requireUppercase,
      ),
      requireLowercase: configService.get<boolean>(
        'password.requireLowercase',
        DEFAULT_PASSWORD_VALIDATION_CONFIG.requireLowercase,
      ),
      requireNumbers: configService.get<boolean>(
        'password.requireNumbers',
        DEFAULT_PASSWORD_VALIDATION_CONFIG.requireNumbers,
      ),
      requireSpecialChars: configService.get<boolean>(
        'password.requireSpecialChars',
        DEFAULT_PASSWORD_VALIDATION_CONFIG.requireSpecialChars,
      ),
    };
  }

  return loadPasswordValidationConfigFromEnv();
}

export default registerAs('password', () => loadPasswordValidationConfigFromEnv());
