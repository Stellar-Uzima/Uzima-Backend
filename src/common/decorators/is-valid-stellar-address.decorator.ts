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
