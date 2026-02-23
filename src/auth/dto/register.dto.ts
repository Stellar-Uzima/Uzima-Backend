import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { IsISO31661Alpha2 } from 'class-validator-country-code';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 32)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsISO31661Alpha2({ message: 'Country must be a valid ISO 3166-1 alpha-2 code' })
  country: string;
}
