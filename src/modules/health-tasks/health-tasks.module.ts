import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthTasksController } from './health-tasks.controller';
import { HealthTasksService } from './health-tasks.service';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { TaskCompletion } from '../../database/entities/task-completion.entity';
import { User } from '../../entities/user.entity';
import { PriorityService } from './services/priority.service';
import { ArchiveService } from './services/archive.service';
import { CompletionService } from './services/completion.service';
import { AnalyticsService } from './services/analytics.service';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { ActivityLogService } from './services/activity-log.service';
import { TaskAttachment } from '../../database/entities/task-attachment.entity';
import { SearchHistory } from '../../database/entities/search-history.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { ActivityLogService } from './services/activity-log.service';
import { TaskAttachment } from '../../database/entities/task-attachment.entity';
import { SearchHistory } from '../../database/entities/search-history.entity';
import { TaskActivity } from '../../database/entities/task-activity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HealthTask,
      TaskCompletion,
      User,
      TaskAttachment,
      SearchHistory,
      TaskActivity,
    ]),
  ],
  controllers: [HealthTasksController],
  providers: [
    HealthTasksService,
    PriorityService,
    ArchiveService,
    CompletionService,
    AnalyticsService,
    TaskSearchService,
    AttachmentsService,
    DuplicationService,
    ActivityLogService,
  ],
  exports: [HealthTasksService, CompletionService, AnalyticsService],
})
export class HealthTasksModule {}
