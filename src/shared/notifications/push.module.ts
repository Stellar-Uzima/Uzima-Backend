import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushService } from './services/push.service';
import { PushNotificationService } from './services/push-notification.service';
import { PushSubscriptionService } from './services/push-subscription.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  providers: [PushService, PushNotificationService, PushSubscriptionService],
  exports: [PushService, PushNotificationService, PushSubscriptionService],
})
export class PushModule {}
