import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthProgramEnrollmentController } from './health-program-enrollment.controller';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';
import {
  HealthProgramEnrollment,
  HealthProgramEnrollmentHistory,
} from './entities/health-program-enrollment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HealthProgramEnrollment, HealthProgramEnrollmentHistory])],
  controllers: [HealthProgramEnrollmentController],
  providers: [HealthProgramEnrollmentService],
  exports: [HealthProgramEnrollmentService],
})
export class HealthProgramEnrollmentModule {}
