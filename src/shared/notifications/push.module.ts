import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushService } from './services/push.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
