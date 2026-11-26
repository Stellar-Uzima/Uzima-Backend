import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Stellar public key: starts with 'G', followed by 55 uppercase base32 characters (A-Z, 2-7)
 * Total length: 56 characters
 */
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * `class-validator` constraint that validates whether a string is a well-formed
 * Stellar public key (a 56-character string beginning with `G` followed by 55
 * uppercase base-32 characters in the range `A-Z` and `2-7`).
 */
@ValidatorConstraint({ name: 'isValidStellarAddress', async: false })
export class IsValidStellarAddressConstraint
  implements ValidatorConstraintInterface
{
  /**
   * Returns `true` when {@link value} matches the Stellar public-key format.
   *
   * @param value - The value to test, expected to be a string.
   * @param _args - Validation arguments provided by `class-validator` (unused).
   * @returns `true` if the value is a valid Stellar address, `false` otherwise.
   */
  validate(value: any, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    return STELLAR_ADDRESS_REGEX.test(value);
  }

  /**
   * Returns the human-readable error message used when validation fails.
   *
   * @param _args - Validation arguments provided by `class-validator` (unused).
   * @returns A descriptive error string explaining the expected format.
   */
  defaultMessage(_args: ValidationArguments): string {
    return 'Invalid Stellar wallet address. Must be a 56-character string starting with "G" followed by uppercase base32 characters (A-Z, 2-7).';
  }
}

/**
 * Property decorator that validates a DTO field as a valid Stellar public key.
 *
 * A valid Stellar address is a 56-character string that starts with `G` and is
 * followed by 55 uppercase base-32 characters (`A-Z`, `2-7`).  Uses
 * {@link IsValidStellarAddressConstraint} under the hood.
 *
 * @param validationOptions - Standard `class-validator` options (e.g. `message`,
 *   `groups`, `always`).
 * @returns A property decorator that registers the Stellar address validation rule.
 *
 * @example
 * ```ts
 * export class CreateWalletDto {
 *   @IsValidStellarAddress()
 *   stellarAddress: string;
 * }
 * ```
 */
export function IsValidStellarAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidStellarAddress',
      target: object.constructor,
      propertyName,
      constraints: [],
      options: validationOptions,
      validator: IsValidStellarAddressConstraint,
    });
  };
}
/**
   * Validates whether a value is a properly formatted Stellar public account address.
   *
   * @param value - Candidate value being validated.
   * @param args - Validation arguments containing property and constraint context.
   * @returns `true` if the value is a valid Stellar address, otherwise `false`.
   */
  validate(value: unknown, args: ValidationArguments): boolean {
    // ...
  }

  /**
   * Provides the default validation error message when Stellar address validation fails.
   *
   * @param args - Validation arguments containing property and constraint context.
   * @returns Human-readable validation error message.
   */
  defaultMessage(args: ValidationArguments): string {
    // ...
  }

/**
 * Property validation decorator that asserts a field contains a valid Stellar address.
 *
 * @param validationOptions - Optional class-validator options such as custom messages or groups.
 * @returns A property decorator registering the Stellar address validation rule.
 */
export function IsValidStellarAddress(validationOptions?: ValidationOptions) {
  // ...
}