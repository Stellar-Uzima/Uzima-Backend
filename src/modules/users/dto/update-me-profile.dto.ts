import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Fields a signed-in user is allowed to change on their own profile (#1290).
 *
 * This is an allowlist by construction: only the properties declared here are
 * accepted, and the controller runs the pipe with `forbidNonWhitelisted`, so
 * anything else — `role`, `status`, `isVerified`, `password`, `walletBalance`,
 * `failedLoginAttempts`, `lockedUntil`, `referralCode` — is rejected with a
 * 400 rather than silently ignored. Sensitive fields therefore have no code
 * path through this endpoint.
 */
export class UpdateMeProfileDto {
  @ApiPropertyOptional({
    description: 'Given name. Trimmed; must not be blank when supplied.',
    example: 'Amina',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'firstName must be a string' })
  @MinLength(1, { message: 'firstName must not be empty' })
  @MaxLength(100, { message: 'firstName must be at most 100 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Family name. Trimmed; must not be blank when supplied.',
    example: 'Okonkwo',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'lastName must be a string' })
  @MinLength(1, { message: 'lastName must not be empty' })
  @MaxLength(100, { message: 'lastName must be at most 100 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Contact number in E.164 format, e.g. +2348012345678.',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString({ message: 'phoneNumber must be a string' })
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message:
      'phoneNumber must be in E.164 format with a leading "+" and 8-15 digits (e.g. +2348012345678)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL. Must be an absolute http(s) URL.',
    example: 'https://cdn.example.com/avatars/amina.png',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'avatar must be a string' })
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: true,
    },
    {
      message: 'avatar must be an absolute http:// or https:// URL',
    },
  )
  @MaxLength(500, { message: 'avatar must be at most 500 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  avatar?: string;
}
