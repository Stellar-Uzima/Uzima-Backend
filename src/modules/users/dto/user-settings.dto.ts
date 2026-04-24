import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsOptional,
    IsString,
    Length,
    Matches,
    ValidateIf,
} from 'class-validator';

import { Transform } from 'class-transformer';

export const SUPPORTED_LANGUAGE_CODES = [
    'en',
    'fr',
    'ar',
    'sw',
    'ha',
    'yo',
    'am',
    'ig',
    'zu',
    'so',
    'tw',
    'wo',
] as const;

const trimString = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

const trimToNull = ({ value }: { value: unknown }) => {
    if (value == null) {
        return null;
    }

    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

const toUpperCase = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value;

const toLowerCase = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

export class UserSettingsResponseDto {
    @ApiProperty({
        description: 'Display name used across the application',
        example: 'Amina Diallo',
    })
    fullName!: string;

    @ApiProperty({
        description: 'User first name',
        example: 'Amina',
    })
    firstName!: string;

    @ApiProperty({
        description: 'User last name',
        example: 'Diallo',
    })
    lastName!: string;

    @ApiProperty({
        description: 'Preferred language code',
        example: 'en',
        enum: SUPPORTED_LANGUAGE_CODES,
        default: 'en',
    })
    preferredLanguage!: string;

    @ApiProperty({
        description: 'ISO 3166-1 alpha-2 country code, or ZZ when unset',
        example: 'NG',
        default: 'ZZ',
    })
    country!: string;

    @ApiProperty({
        description: 'Phone number with country code',
        example: '+2348012345678',
        nullable: true,
        default: null,
    })
    phoneNumber!: string | null;
}

export class UpdateUserSettingsDto {
    @ApiPropertyOptional({
        description: 'Display name used across the application',
        example: 'Amina Diallo',
        minLength: 1,
        maxLength: 201,
    })
    @IsOptional()
    @Transform(trimString)
    @IsString({ message: 'Full name must be a string' })
    @Length(1, 201, {
        message: 'Full name must be between 1 and 201 characters',
    })
    fullName?: string;

    @ApiPropertyOptional({
        description: 'User first name',
        example: 'Amina',
        minLength: 1,
        maxLength: 100,
    })
    @IsOptional()
    @Transform(trimString)
    @IsString({ message: 'First name must be a string' })
    @Length(1, 100, {
        message: 'First name must be between 1 and 100 characters',
    })
    firstName?: string;

    @ApiPropertyOptional({
        description: 'User last name',
        example: 'Diallo',
        minLength: 1,
        maxLength: 100,
    })
    @IsOptional()
    @Transform(trimString)
    @IsString({ message: 'Last name must be a string' })
    @Length(1, 100, {
        message: 'Last name must be between 1 and 100 characters',
    })
    lastName?: string;

    @ApiPropertyOptional({
        description: 'Preferred language code',
        example: 'sw',
        enum: SUPPORTED_LANGUAGE_CODES,
    })
    @IsOptional()
    @Transform(toLowerCase)
    @IsString({ message: 'Preferred language must be a string' })
    @IsIn(SUPPORTED_LANGUAGE_CODES, {
        message: `Preferred language must be one of: ${SUPPORTED_LANGUAGE_CODES.join(', ')}`,
    })
    preferredLanguage?: string;

    @ApiPropertyOptional({
        description: 'Country code using ISO 3166-1 alpha-2 format',
        example: 'KE',
    })
    @IsOptional()
    @Transform(toUpperCase)
    @IsString({ message: 'Country must be a string' })
    @Length(2, 2, {
        message: 'Country must be exactly 2 characters',
    })
    @Matches(/^[A-Z]{2}$/, {
        message: 'Country must be a valid 2-letter ISO code',
    })
    country?: string;

    @ApiPropertyOptional({
        description: 'Phone number with country code, or null to clear it',
        example: '+254712345678',
        nullable: true,
    })
    @IsOptional()
    @Transform(trimToNull)
    @ValidateIf((_, value) => value !== null)
    @IsString({ message: 'Phone number must be a string' })
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message:
            'Please provide a valid phone number with country code (e.g., +2348012345678)',
    })
    phoneNumber?: string | null;
}