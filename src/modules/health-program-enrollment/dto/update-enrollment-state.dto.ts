import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { HealthProgramEnrollmentState } from '../enums/health-program-enrollment-state.enum';

export class UpdateEnrollmentStateDto {
  @ApiProperty({ enum: HealthProgramEnrollmentState })
  @IsEnum(HealthProgramEnrollmentState)
  state: HealthProgramEnrollmentState;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
