import { IsArray, IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHealthProfileDto {
  @ApiPropertyOptional({
    description: 'List of user health goals',
    example: ['Exercise daily', 'Eat healthy', 'Sleep 8 hours'],
    isArray: true,
  })
  @IsArray()
  @IsOptional()
  healthGoals?: string[];

  @ApiPropertyOptional({
    description: 'User chronic conditions',
    example: 'Diabetes Type 2',
  })
  @IsString()
  @IsOptional()
  chronicConditions?: string;

  @ApiPropertyOptional({
    description: 'Preferred type of healer',
    example: 'General Practitioner',
  })
  @IsString()
  @IsOptional()
  preferredHealerType?: string;

  @ApiPropertyOptional({
    description: 'Daily task target for health activities',
    example: 5,
  })
  @IsNumber()
  @IsOptional()
  dailyTaskTarget?: number;
}
