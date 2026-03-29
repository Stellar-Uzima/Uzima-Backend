import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validator constraint for coupon code validation
 * - Must be between 6 and 20 characters
 * - Can only contain alphanumeric characters and hyphens
 * - No special characters or spaces allowed
 */
@ValidatorConstraint({ name: 'isValidCouponCode', async: false })
export class IsValidCouponCodeConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (typeof value !== 'string') {
      return false;
    }

    // Check length (6-20 characters)
    if (value.length < 6 || value.length > 20) {
      return false;
    }

    // Check format: only alphanumeric characters and hyphens
    const validFormat = /^[A-Za-z0-9-]+$/.test(value);
    return validFormat;
  }

  defaultMessage(args?: ValidationArguments) {
    const value = (args?.value as string) || '';
    
    // Provide specific error message based on what's wrong
    if (value.length === 0) {
      return 'Coupon code cannot be empty';
    }
    
    if (value.length < 6) {
      return `Coupon code must be at least 6 characters long (current: ${value.length})`;
    }
    
    if (value.length > 20) {
      return `Coupon code must not exceed 20 characters (current: ${value.length})`;
    }
    
    if (!/^[A-Za-z0-9-]+$/.test(value)) {
      return 'Coupon code can only contain letters, numbers, and hyphens. No spaces or special characters allowed';
    }
    
    return 'Invalid coupon code format';
  }
}

/**
 * Custom decorator for validating coupon code format
 * 
 * Rules:
 * - Length: 6-20 characters
 * - Characters: Alphanumeric (A-Z, a-z, 0-9) and hyphens (-) only
 * - No special characters (!, @, #, $, %, spaces, etc.)
 * 
 * Usage:
 * @IsValidCouponCode({
 *   message: 'Invalid coupon code format'
 * })
 * code: string;
 * 
 * @IsValidCouponCode()
 * code: string;
 */
export function IsValidCouponCode(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidCouponCode',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: validationOptions,
      validator: IsValidCouponCodeConstraint,
    });
  };
}
