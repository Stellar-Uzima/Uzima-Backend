import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
