import { IsString, IsOptional, Length, Matches, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// List of supported language codes
const SUPPORTED_LANGUAGE_CODES = [
  'en', // English
  'fr', // French
  'ar', // Arabic
  'sw', // Swahili
  'ha', // Hausa
  'yo', // Yoruba
  'am', // Amharic
  'ig', // Igbo
  'zu', // Zulu
  'so', // Somali
  'tw', // Twi
  'wo', // Wolof
];

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Full name must be a string' })
  @Length(1, 100, { message: 'Full name must be between 1 and 100 characters' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'User preferred language code (ISO 639-1)',
    example: 'en',
    enum: SUPPORTED_LANGUAGE_CODES,
  })
  @IsOptional()
  @IsString({ message: 'Preferred language must be a string' })
  @IsIn(SUPPORTED_LANGUAGE_CODES, {
    message: `Preferred language must be one of the following: ${SUPPORTED_LANGUAGE_CODES.join(', ')}`,
  })
  preferredLanguage?: string;

  @ApiPropertyOptional({
    description: 'User country code (ISO 3166-1 alpha-2)',
    example: 'US',
    minLength: 2,
    maxLength: 2,
  })
  @IsOptional()
  @IsString({ message: 'Country code must be a string' })
  @Length(2, 2, { message: 'Country code must be exactly 2 characters (ISO 3166-1 alpha-2)' })
  @Matches(/^[A-Z]{2}$/i, {
    message: 'Country code must be a valid 2-letter ISO code (e.g., US, GB, NG)',
  })
  country?: string;

  @ApiPropertyOptional({
    description: 'User phone number with country code',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Please provide a valid phone number with country code (e.g., +2348012345678)',
  })
  phoneNumber?: string;
}
