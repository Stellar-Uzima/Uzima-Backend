import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import StellarSdk from 'stellar-sdk';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../../rewards/enums/reward-status.enum';
import { StellarService } from '../../stellar/stellar.service';
import { XlmPriceService } from '../../stellar/xlm-price.service';
import { User } from '../../entities/user.entity';
import { WalletSummaryDto } from './dto/wallet-summary.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(RewardTransaction)
    private rewardTransactionRepo: Repository<RewardTransaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private stellarService: StellarService,
    private xlmPriceService: XlmPriceService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getWalletSummary(userId: string): Promise<WalletSummaryDto> {
    const cacheKey = `wallet_summary:${userId}`;
    const cached = await this.cacheManager.get<WalletSummaryDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return { walletLinked: false } as any;
    }

    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      return { walletLinked: false } as any;
    }

    // Fetch live balance
    let liveBalance = 'unavailable';
    try {
      liveBalance = await this.stellarService.getAccountBalance(walletAddress);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch balance for ${walletAddress}: ${error.message}`,
      );
    }

    // Total earned from tasks
    const totalEarnedFromTasks = await this.rewardTransactionRepo
      .createQueryBuilder('rt')
      .select('SUM(rt.amount)', 'total')
      .where('rt.userId = :userId', { userId })
      .andWhere('rt.status = :status', { status: RewardStatus.SUCCESS })
      .getRawOne();

    // Total spent on consultations (placeholder - assuming 0 for now)
    const totalSpentOnConsultations = '0.00';

    // Pending rewards
    const pendingRewards = await this.rewardTransactionRepo
      .createQueryBuilder('rt')
      .select('SUM(rt.amount)', 'total')
      .where('rt.userId = :userId', { userId })
      .andWhere('rt.status = :status', { status: RewardStatus.PENDING })
      .getRawOne();

    // XLM USD rate
    const xlmUsdRate = await this.xlmPriceService.getXlmUsdRate();

    // Calculate balance in USD
    const balanceUsd =
      liveBalance !== 'unavailable'
        ? (parseFloat(liveBalance) * xlmUsdRate).toFixed(2)
        : '0.00';

    const summary: WalletSummaryDto = {
      walletAddress,
      liveBalance,
      totalEarnedFromTasks: totalEarnedFromTasks?.total || '0.00',
      totalSpentOnConsultations,
      pendingRewards: pendingRewards?.total || '0.00',
      xlmUsdRate,
      balanceUsd,
      walletLinked: true,
    };

    // Cache for 3 minutes
    await this.cacheManager.set(cacheKey, summary, 3 * 60 * 1000);

    return summary;
  }

  @OnEvent('reward.earned')
  async invalidateCache(payload: { userId: string }) {
    const cacheKey = `wallet_summary:${payload.userId}`;
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Links a Stellar address to the user account.
   * Validates format, existence on network, and uniqueness.
   */
  async linkWallet(userId: string, address: string): Promise<User> {
    // 1. Validate format
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
      throw new BadRequestException('Invalid Stellar address format');
    }

    // 2. Verify account exists on Stellar network
    const exists = await this.stellarService.accountExists(address);
    if (!exists) {
      throw new BadRequestException(
        'Stellar account not found on the network. Please ensure it is funded.',
      );
    }

    // 3. Check for existing link
    const alreadyLinked = await this.userRepo.findOne({
      where: { stellarWalletAddress: address },
    });

    if (alreadyLinked) {
      if (alreadyLinked.id === userId) {
        return alreadyLinked; // Already linked to this user
      }
      throw new ConflictException(
        'This Stellar address is already linked to another account',
      );
    }

    // 4. Update user
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    user.stellarWalletAddress = address;
    const updatedUser = await this.userRepo.save(user);

    // 5. Invalidate cache
    await this.invalidateCache({ userId });

    this.logger.log(`Wallet linked: ${address} for user ${userId}`);
    return updatedUser;
  }
}
