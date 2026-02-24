import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from '../tasks.controller';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { TaskAssignmentService } from './task-assignment.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([DailyTaskAssignment, HealthTask, TaskCompletion]),
  ],
  controllers: [TasksController],
  providers: [TaskAssignmentService],
  exports: [TaskAssignmentService],
})
export class TaskAssignmentModule {}
