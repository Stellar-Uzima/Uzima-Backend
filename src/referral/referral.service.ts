import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { ReferralRecord } from './entities/referral-record.entity';
import { RedeemReferralDto } from './dto/redeem-referral.dto';

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

  async redeemReferral(userId: string, dto: RedeemReferralDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const referrer = await this.userRepo.findOne({
      where: { referralCode: dto.referralCode },
    });

    if (!referrer) {
      throw new BadRequestException('Malformed or invalid referral code');
    }

    if (referrer.id === userId) {
      throw new BadRequestException('Self-referral attempt rejected');
    }

    const existing = await this.referralRepo.findOne({
      where: { referred: { id: userId } },
    });

    if (existing) {
      throw new BadRequestException('User has already redeemed a referral code');
    }

    const record = this.referralRepo.create({
      referrer,
      referred: user,
      rewardPaid: false,
    });

    return this.referralRepo.save(record);
  }

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
  }
}
