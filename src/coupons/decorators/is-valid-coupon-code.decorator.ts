import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validator constraint for coupon code validation
 * - Must contain exactly 8 alphanumeric characters
 * - No special characters or spaces allowed
 */
@ValidatorConstraint({ name: 'isValidCouponCode', async: false })
export class IsValidCouponCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') {
      return false;
    }

    if (value.length !== 8) {
      return false;
    }

    const validFormat = /^[A-Za-z0-9]+$/.test(value);
    return validFormat;
  }

  defaultMessage(args?: ValidationArguments) {
    const value = (args?.value as string) || '';

    // Provide specific error message based on what's wrong
    if (value.length === 0) {
      return 'Coupon code cannot be empty';
    }

    if (value.length !== 8) {
      return `Coupon code must contain exactly 8 characters (current: ${value.length})`;
    }

    if (!/^[A-Za-z0-9]+$/.test(value)) {
      return 'Coupon code can only contain letters and numbers';
    }

    return 'Invalid coupon code format';
  }
}

/**
 * Custom decorator for validating coupon code format
 *
 * Rules:
 * - Length: exactly 8 characters
 * - Characters: Alphanumeric (A-Z, a-z, 0-9) only
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
  return function (object: object, propertyName: string) {
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
