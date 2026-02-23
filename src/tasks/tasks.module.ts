import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { HealthTask } from './entities/health-task.entity';
import { Category } from './entities/category.entity';
import { HealthTaskRepository } from './repositories/health-task.repository';

@Module({
  imports: [TypeOrmModule.forFeature([HealthTask, Category])],
  controllers: [TasksController],
  providers: [TasksService, HealthTaskRepository],
  exports: [TasksService],
})
export class TasksModule {}
