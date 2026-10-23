import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
feat/data-retention-jobs

import { CleanupScheduler } from './cleanup.scheduler';

import { UsersModule } from '../../modules/users/users.module';
main

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
