import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'jane.doe@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({
    description: '8-32 characters with at least one uppercase letter, one lowercase letter, one digit, and one special character.',
    example: 'StrongP@ssw0rd!',
    minLength: 8,
    maxLength: 32,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiProperty({ description: 'User given name', example: 'Jane' })
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @ApiProperty({ description: 'User family name', example: 'Doe' })
  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code (two uppercase letters)',
    example: 'NG',
    minLength: 2,
    maxLength: 2,
  })
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
  referralCode?: string;
}
