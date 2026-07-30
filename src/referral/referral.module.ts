import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
<<<<<<< HEAD
import { BullModule } from '@nestjs/bull';
=======
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
import { ReferralRecord } from './entities/referral-record.entity';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { User } from '../entities/user.entity';
<<<<<<< HEAD
import { REWARD_QUEUE } from '../queue/queue.constants';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralRecord, User]),
    QueueModule,
    BullModule.registerQueue({ name: REWARD_QUEUE }),
  ],
=======

@Module({
  imports: [TypeOrmModule.forFeature([ReferralRecord, User])],
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
  providers: [ReferralService],
  controllers: [ReferralController],
  exports: [ReferralService],
})
export class ReferralModule {}
