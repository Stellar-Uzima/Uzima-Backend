import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { CleanupScheduler } from './cleanup.scheduler';

import { UsersModule } from '../../users/users.module';

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), UsersModule],
  providers: [SchedulerService, CleanupScheduler],
  exports: [SchedulerService],
})
export class SchedulerModule {}
