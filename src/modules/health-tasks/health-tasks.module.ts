import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthTasksController } from './health-tasks.controller';
import { HealthTasksService } from './health-tasks.service';

@Module({
  imports: [
    // TypeOrmModule.forFeature([HealthTask, UserTask]),
  ],
  controllers: [HealthTasksController],
  providers: [HealthTasksService],
  exports: [HealthTasksService],
})
export class HealthTasksModule {}
