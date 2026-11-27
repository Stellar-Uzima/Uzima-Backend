import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { CleanupScheduler } from './cleanup.scheduler';

import { UsersModule } from '../../modules/users/users.module';
import { TasksModule } from '../../tasks/tasks.module';
import { CouponModule } from '../../coupons/coupon.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ReminderScheduler } from './reminder.scheduler';

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), UsersModule, TasksModule, CouponModule, NotificationsModule],
  providers: [SchedulerService, CleanupScheduler, ReminderScheduler],
  exports: [SchedulerService],
})
export class SchedulerModule {}
