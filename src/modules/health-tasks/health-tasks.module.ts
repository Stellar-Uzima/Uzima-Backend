import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthTasksController } from './health-tasks.controller';
import { HealthTasksService } from './health-tasks.service';
import { HealthTask } from '../../tasks/entities/health-task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HealthTask])],
  controllers: [HealthTasksController],
  providers: [HealthTasksService],
  exports: [HealthTasksService],
})
export class HealthTasksModule {}
