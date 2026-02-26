import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 32)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'Country must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters)' })
  country: string;
}
