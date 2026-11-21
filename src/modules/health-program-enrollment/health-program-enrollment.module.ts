import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthProgramEnrollment } from '../../entities/health-program-enrollment.entity';
import { HealthProgramEnrollmentHistory } from '../../entities/health-program-enrollment-history.entity';
import { AdminHealthProgramEnrollmentController } from './admin-health-program-enrollment.controller';
import { HealthProgramEnrollmentController } from './health-program-enrollment.controller';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthProgramEnrollment, HealthProgramEnrollmentHistory])],
  controllers: [HealthProgramEnrollmentController, AdminHealthProgramEnrollmentController],
  providers: [HealthProgramEnrollmentService],
  exports: [HealthProgramEnrollmentService],
})
export class HealthProgramEnrollmentModule {}
