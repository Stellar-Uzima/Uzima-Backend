import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsDecimal,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@modules/auth/enums/role.enum';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by country code', example: 'US' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Filter by role', enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search by name or email',
    example: 'john',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by user account status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Filter users active since this date (recent activity window start)',
    example: '2024-01-01T00:00:00.000Z',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  lastActiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter users active up to this date (recent activity window end)',
    example: '2024-12-31T23:59:59.999Z',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  lastActiveTo?: string;

  @ApiPropertyOptional({
    description: 'Filter users who logged in since this date',
    example: '2024-01-01T00:00:00.000Z',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  lastLoginFrom?: string;

  @ApiPropertyOptional({
    description: 'Minimum wallet balance (inclusive) used as score threshold',
    example: '0',
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minWalletBalance?: number;

  @ApiPropertyOptional({
    description: 'Maximum wallet balance (inclusive) used as score threshold',
    example: '1000000',
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxWalletBalance?: number;

  @ApiPropertyOptional({
    description: 'Minimum daily XLM earned (inclusive)',
    example: '0',
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minDailyEarnings?: number;

  @ApiPropertyOptional({
    description: 'Maximum daily XLM earned (inclusive)',
    example: '100',
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDailyEarnings?: number;
}
