import { IsArray, IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateHealthProfileDto {
  @IsArray()
  @IsOptional()
  healthGoals?: string[];

  @IsString()
  @IsOptional()
  chronicConditions?: string;

  @IsString()
  @IsOptional()
  preferredHealerType?: string;

  @IsNumber()
  @IsOptional()
  dailyTaskTarget?: number;
}