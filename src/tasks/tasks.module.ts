import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { HealthTask } from './entities/health-task.entity';
import { Category } from './entities/category.entity';
import { TaskCompletion } from './entities/task-completion.entity';
import { TaskCompletionService } from './completions/task-completion.service';
import { TaskCompletionController } from './completions/task-completion.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthTask, Category, TaskCompletion]),
    QueueModule,
  ],
  controllers: [TasksController, TaskCompletionController],
  providers: [TasksService, TaskCompletionService],
  exports: [TasksService],
})
export class TasksModule {}
