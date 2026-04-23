import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthTasksController } from './health-tasks.controller';
import { HealthTasksService } from './health-tasks.service';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { PriorityService } from './services/priority.service';
import { ArchiveService } from './services/archive.service';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { TaskAttachment } from '../../database/entities/task-attachment.entity';
import { SearchHistory } from '../../database/entities/search-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthTask, TaskAttachment, SearchHistory]),
  ],
  controllers: [HealthTasksController],
  providers: [
    HealthTasksService,
    PriorityService,
    ArchiveService,
    TaskSearchService,
    AttachmentsService,
    DuplicationService,
  ],
  exports: [HealthTasksService],
})
export class HealthTasksModule {}
