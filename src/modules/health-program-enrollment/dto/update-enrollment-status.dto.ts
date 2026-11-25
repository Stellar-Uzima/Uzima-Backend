import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { HealthProgramEnrollmentStatus } from '../entities/health-program-enrollment.entity';

export class UpdateEnrollmentStatusDto {
  @IsEnum(HealthProgramEnrollmentStatus)
  status: HealthProgramEnrollmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
