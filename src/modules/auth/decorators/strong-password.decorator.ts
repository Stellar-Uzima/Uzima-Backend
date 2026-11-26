import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { PasswordValidatorService } from '../services/password-validator.service';

/** Strength options a caller can override on top of the validator defaults. */
type StrengthOverrides = {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
};

/**
 * Copies only the strength options the caller actually set.
 *
 * The validator merges this object over its defaults with a spread, and a
 * spread copies keys whose value is `undefined`. Passing just `{ message }`
 * therefore used to overwrite every default rule with `undefined`, which
 * silently switched off the length, uppercase, number and special-character
 * checks and let weak passwords through.
 */
function pickStrengthConfig(options?: StrengthOverrides): StrengthOverrides | undefined {
  if (!options) {
    return undefined;
  }

  const config: StrengthOverrides = {};
  if (options.minLength !== undefined) config.minLength = options.minLength;
  if (options.requireUppercase !== undefined) config.requireUppercase = options.requireUppercase;
  if (options.requireLowercase !== undefined) config.requireLowercase = options.requireLowercase;
  if (options.requireNumbers !== undefined) config.requireNumbers = options.requireNumbers;
  if (options.requireSpecialChars !== undefined) {
    config.requireSpecialChars = options.requireSpecialChars;
  }
  return config;
}

/**
 * Custom decorator for password validation using class-validator
 *
 * Usage:
 * @IsStrongPassword({
 *   message: 'Password does not meet security requirements'
 * })
 * password: string;
 *
 * @IsStrongPassword({
 *   minLength: 12,
 *   requireSpecialChars: true,
 *   message: 'Please choose a stronger password'
 * })
 * password: string;
 */
export function IsStrongPassword(
  validationOptions?: ValidationOptions & {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
  },
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(password: string, args: ValidationArguments) {
          // A missing or non-string value is an invalid password, not a crash:
          // without this guard `password.length` throws and the client gets a
          // 500 instead of a field-specific validation error.
          if (typeof password !== 'string') {
            return false;
          }

          const validator = new PasswordValidatorService();
          const config = pickStrengthConfig(validationOptions);

          return validator.validatePassword(password, config).isValid;
        },
        defaultMessage(args?: ValidationArguments) {
          const validator = new PasswordValidatorService();
          const password = (args?.value as string) || '';
          const config = pickStrengthConfig(validationOptions);

          const result = validator.validatePassword(password, config);

          if (validationOptions?.message) {
            return validationOptions.message as any;
          }

          // Return specific error messages
          const errorMessages = result.errors
            .filter((error) => error.severity === 'error')
            .map((error) => error.message)
            .join(', ');

          return (
            errorMessages || 'Password does not meet security requirements'
          );
        },
      },
    });
  };
}

/**
 * Custom decorator for password strength scoring
 *
 * Usage:
 * @HasMinPasswordStrength(80, {
 *   message: 'Password strength score must be at least 80'
 * })
 * password: string;
 */
export function HasMinPasswordStrength(
  minStrength: number = 60,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'hasMinPasswordStrength',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [minStrength],
      validator: {
        validate(password: string, args: ValidationArguments) {
          const validator = new PasswordValidatorService();
          const score = validator.getPasswordStrength(password);
          return score >= minStrength;
        },
        defaultMessage(args?: ValidationArguments) {
          const minStrengthVal =
            (args?.constraints?.[0] as number) || minStrength;
          return (
            (validationOptions?.message as any) ||
            `Password strength score must be at least ${minStrengthVal}. Current score: ${args?.value || 0}`
          );
        },
      },
    });
  };
}

/**
 * Custom decorator for password category validation
 *
 * Usage:
 * @IsStrongPasswordCategory(['good', 'strong', 'very_strong'], {
 *   message: 'Password must be at least good strength'
 * })
 * password: string;
 */
export function IsStrongPasswordCategory(
  allowedCategories: ('fair' | 'good' | 'strong' | 'very_strong')[] = [
    'good',
    'strong',
    'very_strong',
  ],
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPasswordCategory',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [allowedCategories],
      validator: {
        validate(password: string, args: ValidationArguments) {
          const validator = new PasswordValidatorService();
          const category = validator.getPasswordStrengthCategory(password);
          return allowedCategories.includes(category as any);
        },
        defaultMessage(args?: ValidationArguments) {
          const categories =
            (args?.constraints?.[0] as string[]) || allowedCategories;
          return (
            (validationOptions?.message as any) ||
            `Password strength category must be one of: ${categories.join(', ')}`
          );
        },
      },
    });
  };
}
