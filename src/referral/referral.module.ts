import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ReferralRecord } from './entities/referral-record.entity';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { User } from '../entities/user.entity';
import { REWARD_QUEUE } from '../queue/queue.constants';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralRecord, User]),
    QueueModule,
    BullModule.registerQueue({ name: REWARD_QUEUE }),
  ],
  providers: [ReferralService],
  controllers: [ReferralController],
  exports: [ReferralService],
})
export class ReferralModule {}
