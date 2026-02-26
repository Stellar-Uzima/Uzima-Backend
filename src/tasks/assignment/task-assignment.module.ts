// src/tasks/assignment/task-assignment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskAssignmentController } from './task-assignment.controller';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyTaskAssignment,
      HealthTask,
      TaskCompletion,
    ]),
  ],
  controllers: [TaskAssignmentController],
  providers: [TaskAssignmentService],
  exports: [TaskAssignmentService],
})
export class TaskAssignmentModule {}