import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ClaimAttemptLog } from './entities/claim-attempt-log.entity';
import { AntiAbuseService } from './anti-abuse.service';
import { ReferralRecord } from '../../referral/entities/referral-record.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';

/**
 * Provides the shared anti-abuse guard. Modules that process claims
 * (referrals, rewards) import this module and call the guard methods before
 * persisting anything.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      ClaimAttemptLog,
      ReferralRecord,
      RewardTransaction,
      User,
    ]),
  ],
  providers: [AntiAbuseService],
  exports: [AntiAbuseService],
})
export class AntiAbuseModule {}