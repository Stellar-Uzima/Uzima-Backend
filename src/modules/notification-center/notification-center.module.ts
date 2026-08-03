import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '../../queue/queue.module';
import { InAppNotification } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../entities/user.entity';
import { NotificationCenterService } from './notification-center.service';
import { NotificationCenterController } from './notification-center.controller';
import { ChannelRouterService } from './channel-router.service';
import { RetryProcessor } from './processors/retry.processor';
import { SmsService } from '../../shared/sms/sms.service';
import { PushModule } from '../../shared/notifications/push.module';
import { EmailTemplateService } from '../../shared/notifications/services/email-template.service';
import { NOTIFICATION_CENTER_QUEUE } from './constants/notification-center.constants';

@Module({
  imports: [
    ConfigModule,
    QueueModule,
    TypeOrmModule.forFeature([
      InAppNotification,
      NotificationDeliveryLog,
      NotificationPreference,
      User,
    ]),
    // Register the retry queue — BullModule.forRoot is already called in QueueModule
    // which is imported at the app level via the modules that need it.
    // We register only this queue here so BullModule knows its name.
    BullModule.registerQueue({
      name: NOTIFICATION_CENTER_QUEUE,
    }),
    // PushModule is @Global() so PushNotificationService is already available,
    // but importing it here makes the dependency explicit.
    PushModule,
  ],
  controllers: [NotificationCenterController],
  providers: [
    NotificationCenterService,
    ChannelRouterService,
    RetryProcessor,
    SmsService,
    EmailTemplateService,
  ],
  exports: [NotificationCenterService],
})
export class NotificationCenterModule {}
