import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { PasswordValidatorService, PasswordValidationResult } from './password-validator.service';

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
export function IsStrongPassword(validationOptions?: ValidationOptions & {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
}) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(password: string, args: ValidationArguments) {
          const validator = new PasswordValidatorService();
          const config = validationOptions ? {
            minLength: validationOptions.minLength,
            requireUppercase: validationOptions.requireUppercase,
            requireLowercase: validationOptions.requireLowercase,
            requireNumbers: validationOptions.requireNumbers,
            requireSpecialChars: validationOptions.requireSpecialChars
          } : undefined;
          
          return validator.validatePassword(password, config).isValid;
        },
        defaultMessage(args: ValidationArguments) {
          const validator = new PasswordValidatorService();
          const password = args.object[args.property] as string;
          const config = validationOptions ? {
            minLength: validationOptions.minLength,
            requireUppercase: validationOptions.requireUppercase,
            requireLowercase: validationOptions.requireLowercase,
            requireNumbers: validationOptions.requireNumbers,
            requireSpecialChars: validationOptions.requireSpecialChars
          } : undefined;
          
          const result = validator.validatePassword(password, config);
          
          if (validationOptions?.message) {
            return validationOptions.message;
          }
          
          // Return specific error messages
          const errorMessages = result.errors
            .filter(error => error.severity === 'error')
            .map(error => error.message)
            .join(', ');
          
          return errorMessages || 'Password does not meet security requirements';
        }
      }
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
export function HasMinPasswordStrength(minStrength: number = 60, validationOptions?: ValidationOptions) {
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
        defaultMessage(args: ValidationArguments) {
          const minStrength = args.constraints[0] as number;
          return validationOptions?.message || 
                 `Password strength score must be at least ${minStrength}. Current score: ${args.object[args.property]}`;
        }
      }
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
  allowedCategories: ('fair' | 'good' | 'strong' | 'very_strong')[] = ['good', 'strong', 'very_strong'],
  validationOptions?: ValidationOptions
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
          return allowedCategories.includes(category);
        },
        defaultMessage(args: ValidationArguments) {
          const categories = args.constraints[0] as string[];
          return validationOptions?.message || 
                 `Password strength category must be one of: ${categories.join(', ')}`;
        }
      }
    });
  };
}
