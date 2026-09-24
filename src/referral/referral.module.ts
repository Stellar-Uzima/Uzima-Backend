import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralRecord } from './entities/referral-record.entity';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { User } from '../entities/user.entity';
import { AntiAbuseModule } from '../modules/anti-abuse/anti-abuse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralRecord, User]),
    AntiAbuseModule,
  ],
  providers: [ReferralService],
  controllers: [ReferralController],
  exports: [ReferralService],
})
export class ReferralModule {}