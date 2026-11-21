import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A valid avatar storage reference, as produced by the avatar upload
 * (`StorageService.saveFile(..., 'avatars')`): `/uploads/avatars/<uuid v4>-<filename>`.
 *
 * The filename may not contain `/` or `\`, so a reference cannot escape the
 * `avatars` folder (e.g. into `exports/`, which holds other users' data exports).
 */
export const AVATAR_STORAGE_REFERENCE_PATTERN =
  /^\/uploads\/avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+$/i;

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
    description:
      'Storage reference of an uploaded avatar, as returned by the avatar upload ' +
      '(`/uploads/avatars/<uuid>-<filename>`). External URLs and other storage ' +
      'folders are rejected. Send `null` (or an empty string) to clear the avatar.',
    example: '/uploads/avatars/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b-amina.jpg',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'avatar must be a string or null' })
  @MaxLength(500, { message: 'avatar must be at most 500 characters' })
  @Matches(AVATAR_STORAGE_REFERENCE_PATTERN, {
    message:
      'avatar must be a storage reference of the form /uploads/avatars/<uuid>-<filename>',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  avatar?: string | null;
}
