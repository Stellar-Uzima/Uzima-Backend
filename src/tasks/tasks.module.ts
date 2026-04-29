import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksScheduler } from './tasks.scheduler';
import { HealthTask } from './entities/health-task.entity';
import { Category } from './entities/category.entity';
import { TaskCompletion } from './entities/task-completion.entity';
import { TaskCompletionService } from './completions/task-completion.service';
import { TaskCompletionController } from './completions/task-completion.controller';
import { ProofVerificationService } from './completions/verification/proof-verification.service';
import { ProofVerificationProcessor } from './completions/verification/proof-verification.processor';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { TaskAssignmentModule } from './assignment/task-assignment.module';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthTask, Category, TaskCompletion, User]),
    ScheduleModule.forRoot(),
    QueueModule,
    StorageModule,
    TaskAssignmentModule,
  ],

  controllers: [TasksController, TaskCompletionController],
  providers: [
    TasksService,
    TasksScheduler,
    TaskCompletionService,
    ProofVerificationService,
    ProofVerificationProcessor,
  ],
  exports: [TasksService],
})
export class TasksModule {}
