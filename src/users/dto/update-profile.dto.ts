import { IsString, IsOptional, Length, Matches, IsIn, MaxLength } from 'class-validator';
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
    description: 'User country',
    example: 'United States',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Country must be a string' })
  @MaxLength(100, { message: 'Country must be less than 100 characters' })
  country?: string;

  @ApiPropertyOptional({
    description: 'User phone number with country code',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message:
      'Please provide a valid phone number with country code (e.g., +2348012345678)',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'User address',
    example: '123 Main St',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  @MaxLength(255, { message: 'Address must be less than 255 characters' })
  address?: string;

  @ApiPropertyOptional({
    description: 'User city',
    example: 'New York',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City must be less than 100 characters' })
  city?: string;

  @ApiPropertyOptional({
    description: 'Postal Code',
    example: '10001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString({ message: 'Postal code must be a string' })
  @MaxLength(20, { message: 'Postal code must be less than 20 characters' })
  postalCode?: string;
}
