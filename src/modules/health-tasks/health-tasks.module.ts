import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthTasksController } from './health-tasks.controller';
import { HealthTasksService } from './health-tasks.service';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { PriorityService } from './services/priority.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthTask])],
  controllers: [HealthTasksController],
  providers: [HealthTasksService, PriorityService],
  exports: [HealthTasksService],
})
export class HealthTasksModule {}
