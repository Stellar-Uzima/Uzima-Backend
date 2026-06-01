import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class SetAvailabilityDto {
  @ApiProperty({ example: '2026-06-15T09:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-06-15T10:00:00.000Z' })
  @IsDateString()
  endTime: string;
}
