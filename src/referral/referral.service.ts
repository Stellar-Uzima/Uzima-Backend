<<<<<<< HEAD
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { User } from '../entities/user.entity';
import { ReferralRecord } from './entities/referral-record.entity';
import {
  REWARD_DISTRIBUTION_JOB,
  REWARD_QUEUE,
} from '../queue/queue.constants';

const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_REWARD_XLM = 1;

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ReferralRecord)
    private readonly referralRepo: Repository<ReferralRecord>,
    @InjectQueue(REWARD_QUEUE) private readonly rewardQueue: Queue,
  ) {}

  async generateReferralCode(userId: string): Promise<{ referralCode: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.referralCode) {
      return { referralCode: user.referralCode };
    }

    const referralCode = await this.createUniqueCode();
    user.referralCode = referralCode;
    await this.userRepo.save(user);

    return { referralCode };
  }

  async redeemReferralCode(
    userId: string,
    referralCode: string,
  ): Promise<{ message: string; referrerId: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['referredBy'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.referredBy) {
      throw new ConflictException('Referral code already redeemed');
    }

    const normalizedCode = referralCode.trim().toUpperCase();
    const referrer = await this.userRepo.findOne({
      where: { referralCode: normalizedCode },
    });

    if (!referrer) {
      throw new NotFoundException('Invalid referral code');
    }

    if (referrer.id === userId) {
      throw new BadRequestException('Cannot redeem your own referral code');
    }

    user.referredBy = referrer;
    await this.userRepo.save(user);

    return {
      message: 'Referral code applied successfully',
      referrerId: referrer.id,
    };
=======
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
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
  }

  async getMyReferrals(userId: string) {
    return this.referralRepo.find({
      where: { referrer: { id: userId } },
      relations: ['referred'],
<<<<<<< HEAD
      order: { createdAt: 'DESC' },
    });
  }

  async getUserWithReferralCode(userId: string) {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  @OnEvent('task.completed')
  async handleFirstHealthTaskCompletion(payload: {
    userId: string;
    completionId?: string;
  }) {
    const userId = payload?.userId;
    if (!userId) return;

=======
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
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['referredBy'],
    });

<<<<<<< HEAD
    if (!user?.referredBy) return;

    const existingRecord = await this.referralRepo.findOne({
      where: { referred: { id: userId } },
    });
    if (existingRecord?.rewardPaid) return;

    const record =
      existingRecord ??
      this.referralRepo.create({
        referrer: user.referredBy,
        referred: user,
        rewardPaid: false,
      });

    if (record.rewardPaid) return;

    const completionId =
      payload.completionId ?? `referral-first-task:${userId}`;

    await this.rewardQueue.add(REWARD_DISTRIBUTION_JOB, {
      completionId,
      userId: user.referredBy.id,
      xlmAmount: REFERRAL_REWARD_XLM,
    });

    record.rewardPaid = true;
    record.rewardPaidAt = new Date();
    await this.referralRepo.save(record);

    this.logger.log(
      `Referral reward queued for referrer ${user.referredBy.id} (referred user ${userId})`,
    );
  }

  private async createUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .slice(0, REFERRAL_CODE_LENGTH);
      const existing = await this.userRepo.findOne({
        where: { referralCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new ConflictException('Unable to generate unique referral code');
=======
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
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
  }
}
