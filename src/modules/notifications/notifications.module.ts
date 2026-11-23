import { Module } from '@nestjs/common';
import { NotificationCenterModule } from '../notification-center/notification-center.module';
import { PushModule } from '../../shared/notifications/push.module';
import { PushSubscriptionsController } from './push-subscriptions.controller';

/**
 * Public notification module.
 *
 * NotificationCenterModule is the single implementation.  This facade keeps the
 * long-standing NotificationsModule name so feature modules do not need to know
 * where the implementation lives.
 */
@Module({
  imports: [NotificationCenterModule, PushModule],
  controllers: [PushSubscriptionsController],
  exports: [NotificationCenterModule],
})
export class NotificationsModule {}
