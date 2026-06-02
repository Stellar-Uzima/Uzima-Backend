// src/tasks/assignment/task-assignment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskAssignmentController } from './task-assignment.controller';
import { BulkTaskAssignmentService } from './bulk-task-assignment.service';
import { BulkTaskAssignmentProcessor } from './bulk-task-assignment.processor';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { User } from '../../entities/user.entity';
import { RedisModule } from '@nestjs-modules/ioredis';
import { QueueModule } from '../../queue/queue.module';
import { RecurringTaskService } from './recurring-task.service';

@Module({
  imports: [
    RedisModule,
    QueueModule,
    TypeOrmModule.forFeature([
      DailyTaskAssignment,
      HealthTask,
      TaskCompletion,
      User,
    ]),
  ],
  controllers: [TaskAssignmentController],
  providers: [
    TaskAssignmentService,
    BulkTaskAssignmentService,
    BulkTaskAssignmentProcessor,
    RecurringTaskService,
  ],
  exports: [TaskAssignmentService, BulkTaskAssignmentService, RecurringTaskService],
})
export class TaskAssignmentModule {}
