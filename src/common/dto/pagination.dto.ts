import { Type, Transform } from 'class-transformer';
import { IsOptional, IsInt, IsString, IsEnum, Min, Max, IsArray } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class SortFieldDto {
  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'createdAt', 'updatedAt', 'lastActiveAt'],
    default: 'createdAt'
  })
  @IsString()
  @IsOptional()
  field?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC
  })
  @IsEnum(SortOrder)
  @IsOptional()
  order?: SortOrder;
}

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Page number',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 1;
    return Number(value);
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 20;
    return Number(value);
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'limit must not exceed 100' })
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Sort fields',
    type: [SortFieldDto],
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @Type(() => SortFieldDto)
  sort?: SortFieldDto[];

  @ApiPropertyOptional({
    description: 'Search query to filter by email, first name, or last name',
    example: 'john'
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class PaginationMetaDto {
  @ApiProperty({
    description: 'Current page number'
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page'
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of items'
  })
  total: number;

  @ApiProperty({
    description: 'Total number of pages'
  })
  totalPages: number;

  @ApiProperty({
    description: 'Has next page'
  })
  hasNext: boolean;

  @ApiProperty({
    description: 'Has previous page'
  })
  hasPrev: boolean;

  @ApiProperty({
    description: 'Next page number'
  })
  nextPage?: number;

  @ApiProperty({
    description: 'Previous page number'
  })
  prevPage?: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'Array of items'
  })
  data: T[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto
  })
  meta: PaginationMetaDto;
}
