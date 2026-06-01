import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushService } from './services/push.service';
import { PushNotificationService } from './services/push-notification.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  providers: [PushService, PushNotificationService],
  exports: [PushService, PushNotificationService],
})
export class PushModule {}
