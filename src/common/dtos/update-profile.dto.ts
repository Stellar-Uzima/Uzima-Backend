import { IsString, IsOptional, IsUrl, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'First name of the user',
    example: 'John',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: 'First name must be less than 100 characters',
  })
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name of the user',
    example: 'Doe',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: 'Last name must be less than 100 characters',
  })
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Phone number in international format (e.g., +1234567890)',
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone number must be in international format (e.g., +1234567890)',
  })
  @Transform(({ value }) => value?.trim())
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Profile avatar URL',
    example: 'https://example.com/avatar.jpg',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    {
      message: 'Avatar must be a valid URL starting with http:// or https://',
    }
  )
  @MaxLength(500, {
    message: 'Avatar URL must be less than 500 characters',
  })
  @Transform(({ value }) => value?.trim())
  avatar?: string;

  @ApiPropertyOptional({
    description: 'User bio or description',
    example: 'Software developer passionate about blockchain',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Bio must be less than 1000 characters',
  })
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @ApiPropertyOptional({
    description: 'Preferred language code (e.g., en, es, fr)',
    example: 'en',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, {
    message: 'Language code must be in format "en" or "en-US"',
  })
  @Transform(({ value }) => value?.trim())
  preferredLanguage?: string;

  @ApiPropertyOptional({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
    maxLength: 2,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'Country code must be 2 uppercase letters (e.g., US, GB, FR)',
  })
  @Transform(({ value }) => value?.toUpperCase())
  country?: string;
}

export class ProfileResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
  })
  firstName?: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
  })
  lastName?: string;

  @ApiProperty({
    description: 'Full name (auto-generated)',
    example: 'John Doe',
  })
  fullName?: string;

  @ApiProperty({
    description: 'Phone number',
    example: '+1234567890',
  })
  phoneNumber?: string;

  @ApiProperty({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  avatar?: string | null;

  @ApiProperty({
    description: 'User bio',
    example: 'Software developer passionate about blockchain',
    nullable: true,
  })
  bio?: string | null;

  @ApiProperty({
    description: 'Preferred language',
    example: 'en',
  })
  preferredLanguage?: string;

  @ApiProperty({
    description: 'Country code',
    example: 'US',
  })
  country?: string;

  @ApiProperty({
    description: 'User role',
    enum: ['USER', 'HEALER', 'ADMIN'],
    example: 'USER',
  })
  role: string;

  @ApiProperty({
    description: 'Account status',
    enum: ['active', 'inactive', 'suspended'],
    example: 'active',
  })
  status: string;

  @ApiProperty({
    description: 'Account verification status',
    example: true,
  })
  isVerified: boolean;

  @ApiProperty({
    description: 'Last active timestamp',
    example: '2024-01-01T12:00:00.000Z',
    nullable: true,
  })
  lastActiveAt?: Date | null;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Profile last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  updatedAt: Date;
}
