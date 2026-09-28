import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationDigestRun } from './entities/notification-digest-run.entity';
import { NotificationDigestService } from './notification-digest.service';
import { NotificationDigestScheduler } from './notification-digest.scheduler';
import { UserPreferences } from '../../database/entities/user-preferences.entity';
import { InAppNotification } from '../notification-center/entities/in-app-notification.entity';
import { User } from '../../entities/user.entity';

/**
 * Wires up the notification-digest schedule. The `@Cron` decorator is active
 * because `ScheduleModule.forRoot()` is enabled globally via the shared
 * `SchedulerModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationDigestRun,
      UserPreferences,
      InAppNotification,
      User,
    ]),
  ],
  providers: [NotificationDigestService, NotificationDigestScheduler],
  exports: [NotificationDigestService, NotificationDigestScheduler],
})
export class NotificationDigestModule {}