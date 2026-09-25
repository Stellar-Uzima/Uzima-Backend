import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Role } from '@modules/auth/enums/role.enum';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { ApiPaginationQueryDto } from '@/common/dto/api-pagination.query.dto';

/**
 * Filter + sort parameters for the admin user directory (#1294).
 *
 * Every filter is optional and they compose with AND, so a caller can narrow to
 * `status=active & role=healer & country=NG` in one request instead of paging
 * through the whole table client-side. `q` is the only free-text parameter and
 * is length-bounded so it cannot be used to push an expensive wildcard scan
 * across the whole table.
 */
export class UserDirectoryQueryDto extends ApiPaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text search across email, first name, last name and full name. Escaped and matched with ILIKE, so % and _ are literals.',
    example: 'amaka',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'q must be at most 100 characters' })
  q?: string;

  @ApiPropertyOptional({ description: 'Exact email match (case-insensitive)', example: 'amaka@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Exact country code', example: 'NG' })
  @IsOptional()
  @IsString()
  @Length(2, 3, { message: 'country must be a 2 or 3 letter code' })
  country?: string;

  @ApiPropertyOptional({ description: 'Filter by role', enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: `role must be one of: ${Object.values(Role).join(', ')}` })
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filter by account status. Deactivation sets status=inactive and isActive=false together.',
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: `status must be one of: ${Object.values(UserStatus).join(', ')}` })
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Filter by email verification state', example: true })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ description: 'Filter by the legacy isActive flag', example: true })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by registration date, inclusive lower bound', example: '2025-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'createdFrom must be an ISO-8601 date-time' })
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by registration date, inclusive upper bound', example: '2025-12-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString({}, { message: 'createdTo must be an ISO-8601 date-time' })
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Only accounts active at or after this instant', example: '2025-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'lastActiveFrom must be an ISO-8601 date-time' })
  lastActiveFrom?: string;

  @ApiPropertyOptional({ description: 'Only accounts active at or before this instant', example: '2025-06-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString({}, { message: 'lastActiveTo must be an ISO-8601 date-time' })
  lastActiveTo?: string;

  @ApiPropertyOptional({ description: 'Only accounts that provided a phone number', example: true })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  hasPhone?: boolean;

  @ApiPropertyOptional({ description: 'Only accounts with a profile picture', example: false })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  hasAvatar?: boolean;
}
