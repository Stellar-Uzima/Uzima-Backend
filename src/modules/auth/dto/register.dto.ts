import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  Length,
  Matches,
  MaxLength,
  Transform,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../decorators/strong-password.decorator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeCountryCode,
  normalizeEmail,
} from '../services/credential-normalizer';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address. Stored lowercase and trimmed.',
    example: 'jane.doe@example.com',
    format: 'email',
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({
    description:
      'At least 8 characters with an uppercase letter, a lowercase letter, a digit and a special character. ' +
      'Rejected outright above 72 bytes, because bcrypt silently discards input past that point and two ' +
      'passwords sharing a 72-byte prefix would otherwise be interchangeable.',
    example: 'StrongP@ssw0rd!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
  })
  @IsStrongPassword({ message: 'Password does not meet the security policy' })
  password: string;

  @ApiProperty({ description: 'User given name', example: 'Jane', maxLength: 100 })
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  @Length(1, 100, { message: 'First name must be between 1 and 100 characters' })
  firstName: string;

  @ApiProperty({ description: 'User family name', example: 'Doe', maxLength: 100 })
  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  @Length(1, 100, { message: 'Last name must be between 1 and 100 characters' })
  lastName: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code (two uppercase letters)',
    example: 'NG',
    minLength: 2,
    maxLength: 2,
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeCountryCode(value) : value))
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message:
      'Country must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters)',
  })
  country: string;

  @ApiPropertyOptional({
    description: 'Optional phone number in E.164 format',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format',
  })
  // optional phone field (E.164). Keep optional to avoid breaking existing call sites.
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(6, 12)
  @MaxLength(12, { message: 'referralCode must be at most 12 characters' })
  referralCode?: string;
}
