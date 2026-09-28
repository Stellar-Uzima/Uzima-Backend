import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralRecord } from './entities/referral-record.entity';
import { ReferralRewardSettlement } from './entities/referral-reward-settlement.entity';
import { ReferralService } from './referral.service';
import { ReferralRewardSettlementService } from './referral-reward-settlement.service';
import { ReferralController } from './referral.controller';
import { User } from '../entities/user.entity';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';
import { AntiAbuseModule } from '../modules/anti-abuse/anti-abuse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReferralRecord,
      ReferralRewardSettlement,
      User,
      RewardTransaction,
    ]),
    AntiAbuseModule,
  ],
  providers: [ReferralService, ReferralRewardSettlementService],
  controllers: [ReferralController],
  exports: [ReferralService, ReferralRewardSettlementService],
})
export class ReferralModule {}
