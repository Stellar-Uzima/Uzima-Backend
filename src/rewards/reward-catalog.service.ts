import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RewardCatalog, RewardType, RewardCatalogStatus } from './entities/reward-catalog.entity';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';
import { WalletService } from '../../modules/wallet/wallet.service';

export interface CreateRewardCatalogDto {
  title: string;
  description?: string;
  type: RewardType;
  cost: number;
  stock: number;
  metadata?: Record<string, any>;
}

export interface UpdateRewardCatalogDto {
  title?: string;
  description?: string;
  cost?: number;
  stock?: number;
  status?: RewardCatalogStatus;
  metadata?: Record<string, any>;
}

export interface RedeemRewardDto {
  rewardId: string;
}

export interface RedemptionResult {
  success: boolean;
  message: string;
  reward?: RewardCatalog;
  newBalance?: number;
  transactionId?: string;
}

@Injectable()
export class RewardCatalogService {
  private readonly logger = new Logger(RewardCatalogService.name);

  constructor(
    @InjectRepository(RewardCatalog)
    private readonly catalogRepo: Repository<RewardCatalog>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Admin: Create a new reward catalog entry
   */
  async create(dto: CreateRewardCatalogDto): Promise<RewardCatalog> {
    const reward = this.catalogRepo.create({
      ...dto,
      status: RewardCatalogStatus.ACTIVE,
      redeemedCount: 0,
    });
    const saved = await this.catalogRepo.save(reward);
    this.logger.log(`Reward catalog created: ${saved.id} - ${saved.title}`);
    return saved;
  }

  /**
   * Admin: Update a reward catalog entry
   */
  async update(id: string, dto: UpdateRewardCatalogDto): Promise<RewardCatalog> {
    const reward = await this.catalogRepo.findOne({ where: { id } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    Object.assign(reward, dto);
    const saved = await this.catalogRepo.save(reward);
    this.logger.log(`Reward catalog updated: ${saved.id}`);
    return saved;
  }

  /**
   * Admin: Delete/discontinue a reward
   */
  async delete(id: string): Promise<void> {
    const reward = await this.catalogRepo.findOne({ where: { id } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    reward.status = RewardCatalogStatus.DISCONTINUED;
    await this.catalogRepo.save(reward);
    this.logger.log(`Reward catalog discontinued: ${id}`);
  }

  /**
   * Admin: List all rewards with filters
   */
  async findAll(
    status?: RewardCatalogStatus,
    type?: RewardType,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: RewardCatalog[]; total: number; page: number; limit: number; totalPages: number }> {
    const qb = this.catalogRepo.createQueryBuilder('rc');

    if (status) {
      qb.andWhere('rc.status = :status', { status });
    }
    if (type) {
      qb.andWhere('rc.type = :type', { type });
    }

    qb.orderBy('rc.createdAt', 'DESC');
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin: Get single reward by ID
   */
  async findOne(id: string): Promise<RewardCatalog> {
    const reward = await this.catalogRepo.findOne({ where: { id } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }
    return reward;
  }

  /**
   * User: List available rewards for redemption
   */
  async getAvailableRewards(): Promise<RewardCatalog[]> {
    return this.catalogRepo.find({
      where: {
        status: RewardCatalogStatus.ACTIVE,
      },
      order: { cost: 'ASC' },
    });
  }

  /**
   * User: Redeem a reward
   */
  async redeem(userId: string, dto: RedeemRewardDto): Promise<RedemptionResult> {
    const reward = await this.catalogRepo.findOne({ where: { id: dto.rewardId } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    if (reward.status !== RewardCatalogStatus.ACTIVE) {
      throw new BadRequestException('Reward is not available for redemption');
    }

    if (reward.stock !== -1 && reward.stock <= 0) {
      throw new BadRequestException('Reward is out of stock');
    }

    // Check user's wallet balance
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // For XLM rewards, check wallet balance
    if (reward.type === RewardType.XLM) {
      const walletSummary = await this.walletService.getWalletSummary(userId);
      if (!walletSummary.walletLinked) {
        throw new BadRequestException('No wallet linked. Please link a Stellar wallet first.');
      }

      const liveBalance = parseFloat(walletSummary.liveBalance);
      const minReserve = 0.5;
      const availableBalance = liveBalance - minReserve;

      if (availableBalance < reward.cost) {
        throw new BadRequestException(
          `Insufficient XLM balance. Required: ${reward.cost} XLM, Available: ${availableBalance.toFixed(7)} XLM`,
        );
      }
    }

    // Create reward transaction record
    const transaction = this.rewardRepo.create({
      userId,
      amount: reward.cost,
      currency: 'XLM',
      status: 'SUCCESS', // Assuming instant for catalog redemptions
      metadata: {
        rewardCatalogId: reward.id,
        rewardTitle: reward.title,
        rewardType: reward.type,
      },
    });
    await this.rewardRepo.save(transaction);

    // Deduct cost from user balance (for XLM type)
    if (reward.type === RewardType.XLM) {
      user.walletBalance = parseFloat((user.walletBalance - reward.cost).toFixed(7));
      await this.userRepo.save(user);
    }

    // Update reward stock
    if (reward.stock !== -1) {
      reward.stock -= 1;
    }
    reward.redeemedCount += 1;
    await this.catalogRepo.save(reward);

    // Emit event
    this.eventEmitter.emit('reward.redeemed', {
      userId,
      rewardId: reward.id,
      rewardTitle: reward.title,
      transactionId: transaction.id,
      cost: reward.cost,
    });

    this.logger.log(`Reward redeemed: ${reward.id} by user ${userId}`);

    return {
      success: true,
      message: 'Reward redeemed successfully',
      reward,
      newBalance: user.walletBalance,
      transactionId: transaction.id,
    };
  }

  /**
   * Admin: Get reward analytics
   */
  async getAnalytics(): Promise<any> {
    const totalRewards = await this.catalogRepo.count();
    const activeRewards = await this.catalogRepo.count({
      where: { status: RewardCatalogStatus.ACTIVE },
    });
    const totalRedeemed = await this.catalogRepo
      .createQueryBuilder('rc')
      .select('SUM(rc.redeemedCount)', 'total')
      .getRawOne();

    const byType = await this.catalogRepo
      .createQueryBuilder('rc')
      .select('rc.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(rc.redeemedCount)', 'totalRedeemed')
      .groupBy('rc.type')
      .getRawMany();

    const byStatus = await this.catalogRepo
      .createQueryBuilder('rc')
      .select('rc.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('rc.status')
      .getRawMany();

    const topRedeemed = await this.catalogRepo
      .createQueryBuilder('rc')
      .orderBy('rc.redeemedCount', 'DESC')
      .take(10)
      .getMany();

    return {
      summary: {
        totalRewards,
        activeRewards,
        totalRedemptions: parseInt(totalRedeemed?.total || '0'),
      },
      byType,
      byStatus,
      topRedeemed: topRedeemed.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        cost: r.cost,
        redeemedCount: r.redeemedCount,
        stock: r.stock,
      })),
    };
  }
}