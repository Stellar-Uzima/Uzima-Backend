import { Type } from 'class-transformer';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SortOrder } from '../../../common/dtos/pagination.dto';
import { Role } from '../../../auth/enums/role.enum';
import { UserStatus } from '../../../auth/enums/user-status.enum';

export class UserSearchDto {
  @ApiPropertyOptional({
    description: 'Search query for email, first name, last name, or full name',
    example: 'john doe',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({
    description: 'Enable fuzzy matching for name searches',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  fuzzy?: boolean = true;

  @ApiPropertyOptional({
    description: 'Filter by user role',
    enum: Role,
    example: 'USER',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filter by user status',
    enum: UserStatus,
    example: 'active',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Filter by verified status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by country code',
    example: 'US',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Filter by preferred language',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional({
    description: 'Search only users with phone numbers',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  hasPhone?: boolean;

  @ApiPropertyOptional({
    description: 'Search only users with avatar',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  hasAvatar?: boolean;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of results per page',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['id', 'email', 'firstName', 'lastName', 'fullName', 'role', 'status', 'isVerified', 'createdAt', 'updatedAt', 'lastActiveAt'],
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    example: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}

export class UserSearchResultDto {
  @ApiPropertyOptional({
    description: 'Search result relevance score (0-1)',
    example: 0.95,
  })
  score?: number;

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
    description: 'Full name',
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
  })
  avatar?: string;

  @ApiProperty({
    description: 'User role',
    enum: Role,
    example: Role.USER,
  })
  role: Role;

  @ApiProperty({
    description: 'User status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @ApiProperty({
    description: 'Account verification status',
    example: true,
  })
  isVerified: boolean;

  @ApiProperty({
    description: 'Country code',
    example: 'US',
  })
  country?: string;

  @ApiProperty({
    description: 'Preferred language',
    example: 'en',
  })
  preferredLanguage?: string;

  @ApiProperty({
    description: 'Last active timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  lastActiveAt?: Date;

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

export class UserSearchResponseDto {
  @ApiProperty({
    description: 'Search results',
    type: [UserSearchResultDto],
  })
  results: UserSearchResultDto[];

  @ApiProperty({
    description: 'Total number of results',
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of results per page',
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 8,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Search query used',
    example: 'john doe',
  })
  query?: string;

  @ApiProperty({
    description: 'Search execution time in milliseconds',
    example: 45,
  })
  executionTimeMs: number;

  @ApiProperty({
    description: 'Whether fuzzy matching was used',
    example: true,
  })
  fuzzyUsed: boolean;
}
