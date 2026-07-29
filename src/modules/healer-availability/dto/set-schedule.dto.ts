import { IsInt, IsString, IsBoolean, IsOptional, IsDateString, Min, Max, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek } from '../entities/availability-slot.entity';

export class ScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: DayOfWeek;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;
}

export class SetScheduleDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  slots: ScheduleSlotDto[];

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;
}