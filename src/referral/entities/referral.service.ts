import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ReferralRecord } from './entities/referral-record.entity';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(ReferralRecord)
    private referralRepo: Repository<ReferralRecord>,
  ) {}

  async getMyReferralCode(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { referralCode: user.referralCode };
  }

  async getMyReferrals(userId: string) {
    return this.referralRepo.find({
      where: { referrer: { id: userId } },
      relations: ['referred'],
    });
  }

  /**
   * Call this when user completes first health task
   */
  async handleFirstHealthTaskCompletion(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['referredBy'],
    });

    if (!user || !user.referredBy) return;

    const existingRecord = await this.referralRepo.findOne({
      where: {
        referred: { id: userId },
      },
    });

    if (existingRecord) return;

    const record = this.referralRepo.create({
      referrer: user.referredBy,
      referred: user,
      rewardPaid: true,
      rewardPaidAt: new Date(),
    });

    await this.referralRepo.save(record);

    // TODO: Integrate XLM reward transfer logic here
    // e.g. stellarService.sendXLM(user.referredBy.walletAddress, amount)
  }
}