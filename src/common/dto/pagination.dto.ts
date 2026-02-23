import { Type } from 'class-transformer';
import { IsInt, Min, Max, IsOptional } from 'class-validator';

export class PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'limit must not exceed 100' })
  @IsOptional()
  limit: number = 20;
}
