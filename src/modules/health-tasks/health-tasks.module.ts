import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { HealthTasksController } from './health-tasks.controller';
import { NotesController } from './controllers/notes.controller';
import { HealthTasksService } from './health-tasks.service';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { DailyTaskAssignment } from '../../tasks/entities/daily-task-assignment.entity';
import { PriorityService } from './services/priority.service';
import { ArchiveService } from './services/archive.service';
import { CompletionService } from './services/completion.service';
import { AnalyticsService } from './services/analytics.service';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { ReminderService } from './services/reminder.service';
import { NotesService } from './services/notes.service';
import { SharingService } from './services/sharing.service';
import { AnalyticsService } from './services/analytics.service';
import { TaskAttachment } from '../../database/entities/task-attachment.entity';
import { SearchHistory } from '../../database/entities/search-history.entity';
import { TaskReminder } from '../../database/entities/task-reminder.entity';
import { TaskNote } from '../../database/entities/task-note.entity';
import { TaskShare } from '../../database/entities/task-share.entity';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HealthTask,
      TaskAttachment,
      SearchHistory,
      TaskReminder,
      TaskNote,
      TaskShare,
      TaskCompletion,
      DailyTaskAssignment,
    ]),
    CacheModule.register(),
    NotificationsModule,
  ],
  controllers: [HealthTasksController, NotesController],
  providers: [
    HealthTasksService,
    PriorityService,
    ArchiveService,
    CompletionService,
    AnalyticsService,
    TaskSearchService,
    AttachmentsService,
    DuplicationService,
    ReminderService,
    NotesService,
    SharingService,
    AnalyticsService,
  ],
  exports: [HealthTasksService, ReminderService, NotesService, SharingService, AnalyticsService],
})
export class HealthTasksModule {}
