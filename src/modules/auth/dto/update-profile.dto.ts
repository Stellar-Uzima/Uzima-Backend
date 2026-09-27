import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating user profile information.
 * Sensitive fields like email, password, role, and verification status are excluded.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User given name',
    example: 'Jane',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  @Length(1, 100, { message: 'First name must be between 1 and 100 characters' })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'User family name',
    example: 'Doe',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  @Length(1, 100, { message: 'Last name must be between 1 and 100 characters' })
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Optional phone number in E.164 format',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'NG',
    minLength: 2,
    maxLength: 2,
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'Country must be a valid ISO 3166-1 alpha-2 code (2 uppercase letters)',
  })
  country?: string;

  @ApiPropertyOptional({
    description: 'User city',
    example: 'Lagos',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional({
    description: 'Postal code',
    example: '100001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.png',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Preferred language code (ISO 639-1)',
    example: 'en',
    minLength: 2,
    maxLength: 5,
  })
  @IsOptional()
  @IsString()
  @Length(2, 5)
  preferredLanguage?: string;
}