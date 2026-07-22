import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthReport } from './entities/health-report.entity';
import { HealthReportService } from './health-report.service';
import { HealthReportController } from './health-report.controller';
import { AggregationService } from './aggregation.service';
import { PdfService } from './pdf.service';
import { ReportGenerationProcessor } from './processors/report-generation.processor';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { StreaksModule } from '../streaks/streaks.module';
import { TaskCompletion } from '../tasks/entities/task-completion.entity';
import { HealthTask } from '../tasks/entities/health-task.entity';
import { Consultation } from '../modules/consultations/entities/consultation.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthReport, TaskCompletion, HealthTask, Consultation, User]),
    QueueModule,
    StorageModule,
    StreaksModule,
  ],
  controllers: [HealthReportController],
  providers: [HealthReportService, AggregationService, PdfService, ReportGenerationProcessor],
  exports: [HealthReportService],
})
export class HealthReportModule {}
