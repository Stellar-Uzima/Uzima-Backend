import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

  // beforeEach(async () => {
  //   const module: TestingModule = await Test.createTestingModule({
  //     controllers: [HealerController],
  //   })
/**
 * Stellar public key: starts with 'G', followed by 55 uppercase base32 characters (A-Z, 2-7)
 * Total length: 56 characters
 */
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

@ValidatorConstraint({ name: 'isValidStellarAddress', async: false })
export class IsValidStellarAddressConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    return STELLAR_ADDRESS_REGEX.test(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Invalid Stellar wallet address. Must be a 56-character string starting with "G" followed by uppercase base32 characters (A-Z, 2-7).';
  }
}

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