import { IsString, IsNotEmpty, IsNumber, Min, Max, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Task name',
    example: 'Walk 10,000 steps',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Task description',
    example: 'Walk at least 10,000 steps daily to maintain cardiovascular health',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Category ID',
    example: 2,
  })
  @IsNumber()
  @IsNotEmpty()
  categoryId: number;

  @ApiProperty({
    description: 'XLM reward amount (between 0.1 and 5.0)',
    example: 1.0,
    minimum: 0.1,
    maximum: 5.0,
  })
  @IsNumber()
  @Min(0.1, { message: 'xlmReward must be at least 0.1' })
  @Max(5.0, { message: 'xlmReward must not exceed 5.0' })
  xlmReward: number;
}
