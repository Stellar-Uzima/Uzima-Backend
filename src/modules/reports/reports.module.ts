import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportExportService } from './report-export.service';
import { ReportsSchedulerService } from './reports-scheduler.service';
import { NotificationsModule } from '@/notifications/notifications.module';
import { AuditModule } from '@/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { User } from '@/entities/user.entity';
import { TaskCompletion } from '@/tasks/entities/task-completion.entity';
import { RewardTransaction } from '@/rewards/entities/reward-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TaskCompletion, RewardTransaction]),
    ScheduleModule,
    NotificationsModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService, ReportsSchedulerService],
})
export class ReportsModule {}
