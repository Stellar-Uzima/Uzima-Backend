import { IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListTasksDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  categoryId?: number;
}
