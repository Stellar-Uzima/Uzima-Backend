import { Type } from 'class-transformer';
import { IsOptional, IsEnum, IsBoolean, IsDateString, IsString, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../auth/enums/role.enum';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export class UserFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by user role',
    enum: Role,
    example: Role.USER
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by verification status',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isVerified?: boolean;

  @ApiPropertyOptional({
    description: 'Filter users created from this date',
    example: '2024-01-01T00:00:00.000Z',
    type: String
  })
  @IsOptional()
  @IsDateString()
  createdAtFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter users created up to this date',
    example: '2024-12-31T23:59:59.999Z',
    type: String
  })
  @IsOptional()
  @IsDateString()
  createdAtTo?: string;

  @ApiPropertyOptional({
    description: 'Filter users last active from this date',
    example: '2024-01-01T00:00:00.000Z',
    type: String
  })
  @IsOptional()
  @IsDateString()
  lastActiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter users last active up to this date',
    example: '2024-12-31T23:59:59.999Z',
    type: String
  })
  @IsOptional()
  @IsDateString()
  lastActiveTo?: string;

  @ApiPropertyOptional({
    description: 'Filter by country code',
    example: 'US'
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Filter by preferred language',
    example: 'en'
  })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional({
    description: 'Filter by wallet address (partial match)',
    example: 'GABC...'
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'Filter by stellar wallet address (partial match)',
    example: 'GABC...'
  })
  @IsOptional()
  @IsString()
  stellarWalletAddress?: string;

  @ApiPropertyOptional({
    description: 'Filter by referral code',
    example: 'REF123'
  })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by minimum daily XLM earned',
    example: 10.50,
    type: Number
  })
  @IsOptional()
  @Type(() => Number)
  minDailyXlmEarned?: number;

  @ApiPropertyOptional({
    description: 'Filter by maximum daily XLM earned',
    example: 100.00,
    type: Number
  })
  @IsOptional()
  @Type(() => Number)
  maxDailyXlmEarned?: number;

  @ApiPropertyOptional({
    description: 'Filter by phone number (partial match)',
    example: '+1234567890'
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Filter users with or without password reset tokens',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasPasswordResetToken?: boolean;

  @ApiPropertyOptional({
    description: 'Filter users with or without email verification tokens',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasEmailVerificationToken?: boolean;
}
