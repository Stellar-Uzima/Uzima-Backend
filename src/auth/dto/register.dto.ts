import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString({ message: 'Password must be a string' })
  @Length(8, 32, { message: 'Password must be between 8 and 32 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,32}$/, {
    message:
      'Password must be 8-32 characters and include uppercase, lowercase, number and special character',
  })
  password: string;

  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message:
      'Country must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters)',
  })
  country: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format',
  })
  // optional phone field (E.164). Keep optional to avoid breaking existing call sites.
  phone?: string;
}
