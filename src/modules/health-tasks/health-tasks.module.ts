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

@Module({
  imports: [TypeOrmModule.forFeature([HealthTask, TaskCompletion, User])],
  controllers: [HealthTasksController],
  providers: [HealthTasksService, PriorityService, ArchiveService, CompletionService],
  exports: [HealthTasksService, CompletionService],
})
export class HealthTasksModule {}
