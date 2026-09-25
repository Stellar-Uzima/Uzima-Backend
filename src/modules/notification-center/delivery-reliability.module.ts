import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { DeliverySweeperService } from './delivery-sweeper.service';
import { InAppNotification } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';
import { NOTIFICATION_CENTER_QUEUE } from './constants/notification-center.constants';

/**
 * Adds the delivery-reliability backstop without coupling to the rest of the
 * (still evolving) notification-center wiring. It only needs the delivery
 * audit table, the in-app notification table and the retry queue name, so it
 * imports exactly those three pieces and exposes the sweeper for tests and
 * on-demand runs.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([InAppNotification, NotificationDeliveryLog]),
    BullModule.registerQueue({
      name: NOTIFICATION_CENTER_QUEUE,
    }),
  ],
  providers: [DeliverySweeperService],
  exports: [DeliverySweeperService],
})
export class DeliveryReliabilityModule {}