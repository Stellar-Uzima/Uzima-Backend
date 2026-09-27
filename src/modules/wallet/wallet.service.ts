import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
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
import { Withdrawal, WithdrawalStatus } from './entities/withdrawal.entity';
import { CreateWithdrawalDto, WithdrawalListQueryDto, WithdrawalResponseDto } from './dto/withdrawal.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(RewardTransaction)
    private rewardTransactionRepo: Repository<RewardTransaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Withdrawal)
    private withdrawalRepo: Repository<Withdrawal>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private stellarService: StellarService,
    private xlmPriceService: XlmPriceService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getWalletSummary(userId: string): Promise<Partial<WalletSummaryDto>> {
    const cacheKey = `wallet_summary:${userId}`;
    const cached = await this.cacheManager.get<WalletSummaryDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return { walletLinked: false };
    }

    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      return { walletLinked: false };
    }

    // Fetch live balance
    let liveBalance = 'unavailable';
    try {
      liveBalance = await this.stellarService.getAccountBalance(walletAddress);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to fetch balance for ${walletAddress}: ${message}`,
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

  /**
   * Reconcile a user's wallet balances and return a summary object for accounting
   */
  async reconcile(userId: string): Promise<Partial<WalletSummaryDto>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      return { walletLinked: false };
    }

    let liveBalance = '0.00';
    try {
      liveBalance = await this.stellarService.getAccountBalance(walletAddress);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to fetch balance for reconciliation: ${message}`);
    }

    const totalEarnedFromTasks = await this.rewardTransactionRepo
      .createQueryBuilder('rt')
      .select('SUM(rt.amount)', 'total')
      .where('rt.userId = :userId', { userId })
      .andWhere('rt.status = :status', { status: RewardStatus.SUCCESS })
      .getRawOne();

    const pendingRewards = await this.rewardTransactionRepo
      .createQueryBuilder('rt')
      .select('SUM(rt.amount)', 'total')
      .where('rt.userId = :userId', { userId })
      .andWhere('rt.status = :status', { status: RewardStatus.PENDING })
      .getRawOne();

    // Placeholder for consultations spent calculation - default 0.00
    const totalSpentOnConsultations = '0.00';

    return {
      walletAddress,
      liveBalance,
      totalEarnedFromTasks: totalEarnedFromTasks?.total || '0.00',
      totalSpentOnConsultations,
      pendingRewards: pendingRewards?.total || '0.00',
      walletLinked: true,
    };
  }

  /**
   * Fetch transaction history for a user with pagination and filters.
   */
  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
    type?: string,
  ) {
    const query = this.rewardTransactionRepo
      .createQueryBuilder('rt')
      .where('rt.userId = :userId', { userId });

    if (startDate) {
      query.andWhere('rt.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('rt.createdAt <= :endDate', { endDate });
    }

    if (type) {
      // Assuming 'type' maps to status or we just filter by status for now.
      query.andWhere('rt.status = :type', { type });
    }

    query.orderBy('rt.createdAt', 'DESC');

    const skip = (page - 1) * limit;
    query.skip(skip).take(limit);

    const [data, totalCount] = await query.getManyAndCount();

    return {
      data,
      metadata: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Synchronize the local wallet balance with the live Stellar network balance
   */
  async syncBalance(userId: string): Promise<{ liveBalance: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      throw new BadRequestException('No wallet linked to this account');
    }

    try {
      const liveBalance = await this.stellarService.getAccountBalance(walletAddress);
      user.walletBalance = parseFloat(liveBalance);
      await this.userRepo.save(user);

      // Invalidate the wallet summary cache
      await this.cacheManager.del(`wallet_summary:${userId}`);

      this.logger.log(`Synced wallet balance for user ${userId}: ${liveBalance}`);

      return { liveBalance };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to sync balance for user ${userId}: ${message}`);
      throw new BadRequestException('Unable to sync wallet balance from Stellar network');
    }
  }

  /**
   * Create a new withdrawal request
   */
  async createWithdrawal(userId: string, dto: CreateWithdrawalDto): Promise<WithdrawalResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      throw new BadRequestException('No wallet linked to this account');
    }

    // Verify destination address format
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(dto.destinationAddress)) {
      throw new BadRequestException('Invalid destination address format');
    }

    // Prevent withdrawal to own linked address
    if (dto.destinationAddress === walletAddress) {
      throw new BadRequestException('Cannot withdraw to your own linked wallet address');
    }

    // Check live balance from Stellar network
    let liveBalance = 0;
    try {
      const balanceStr = await this.stellarService.getAccountBalance(walletAddress);
      liveBalance = parseFloat(balanceStr);
    } catch (error) {
      this.logger.warn(`Failed to fetch live balance for withdrawal check: ${error instanceof Error ? error.message : 'Unknown'}`);
      throw new BadRequestException('Unable to verify balance for withdrawal');
    }

    // Check minimum balance (keep 0.5 XLM for account reserve)
    const minReserve = 0.5;
    const availableBalance = liveBalance - minReserve;
    if (availableBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${availableBalance.toFixed(7)} XLM (minimum reserve: ${minReserve} XLM)`
      );
    }

    // Check for pending withdrawals
    const pendingWithdrawals = await this.withdrawalRepo
      .createQueryBuilder('w')
      .select('SUM(w.amount)', 'total')
      .where('w.userId = :userId', { userId })
      .andWhere('w.status IN (:...statuses)', { statuses: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] })
      .getRawOne();

    const pendingTotal = parseFloat(pendingWithdrawals?.total || '0');
    if (availableBalance - pendingTotal < dto.amount) {
      throw new BadRequestException(
        `Insufficient balance considering pending withdrawals. Available after pending: ${(availableBalance - pendingTotal).toFixed(7)} XLM`
      );
    }

    // Create withdrawal record
    const withdrawal = this.withdrawalRepo.create({
      userId,
      amount: dto.amount,
      destinationAddress: dto.destinationAddress,
      memo: dto.memo || null,
      status: WithdrawalStatus.PENDING,
    });

    await this.withdrawalRepo.save(withdrawal);

    // Emit event for admin notification
    this.eventEmitter.emit('wallet.withdrawal.created', {
      withdrawalId: withdrawal.id,
      userId,
      amount: dto.amount,
      destinationAddress: dto.destinationAddress,
    });

    this.logger.log(`Withdrawal created: ${withdrawal.id} for user ${userId}, amount: ${dto.amount} XLM`);

    return this.mapToResponseDto(withdrawal);
  }

  /**
   * Get user's withdrawal history with pagination and filters
   */
  async getWithdrawals(userId: string, query: WithdrawalListQueryDto): Promise<{
    data: WithdrawalResponseDto[];
    metadata: { totalCount: number; page: number; limit: number; totalPages: number };
  }> {
    const qb = this.withdrawalRepo
      .createQueryBuilder('w')
      .where('w.userId = :userId', { userId })
      .orderBy('w.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }

    const skip = (query.page! - 1) * query.limit!;
    qb.skip(skip).take(query.limit!);

    const [data, totalCount] = await qb.getManyAndCount();

    return {
      data: data.map(w => this.mapToResponseDto(w)),
      metadata: {
        totalCount,
        page: query.page!,
        limit: query.limit!,
        totalPages: Math.ceil(totalCount / query.limit!),
      },
    };
  }

  /**
   * Get a single withdrawal by ID (user can only see their own)
   */
  async getWithdrawalById(userId: string, withdrawalId: string): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.withdrawalRepo.findOne({
      where: { id: withdrawalId, userId },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    return this.mapToResponseDto(withdrawal);
  }

  /**
   * Admin: Update withdrawal status (process/complete/reject)
   */
  async updateWithdrawalStatus(
    withdrawalId: string,
    status: WithdrawalStatus,
    transactionHash?: string,
    failureReason?: string,
  ): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING && withdrawal.status !== WithdrawalStatus.PROCESSING) {
      throw new BadRequestException(`Cannot update withdrawal in ${withdrawal.status} status`);
    }

    const previousStatus = withdrawal.status;
    withdrawal.status = status;

    if (status === WithdrawalStatus.PROCESSING) {
      // Moving to processing
    } else if (status === WithdrawalStatus.COMPLETED) {
      withdrawal.completedAt = new Date();
      withdrawal.transactionHash = transactionHash || null;
    } else if (status === WithdrawalStatus.FAILED || status === WithdrawalStatus.REJECTED) {
      withdrawal.failureReason = failureReason || 'Withdrawal failed';
    }

    await this.withdrawalRepo.save(withdrawal);

    // Emit event
    this.eventEmitter.emit('wallet.withdrawal.status_changed', {
      withdrawalId: withdrawal.id,
      userId: withdrawal.userId,
      previousStatus,
      newStatus: status,
      transactionHash,
      failureReason,
    });

    this.logger.log(`Withdrawal ${withdrawal.id} status changed: ${previousStatus} -> ${status}`);

    return this.mapToResponseDto(withdrawal);
  }

  private mapToResponseDto(withdrawal: Withdrawal): WithdrawalResponseDto {
    return {
      id: withdrawal.id,
      amount: parseFloat(withdrawal.amount.toString()),
      destinationAddress: withdrawal.destinationAddress,
      memo: withdrawal.memo || undefined,
      status: withdrawal.status,
      transactionHash: withdrawal.transactionHash || undefined,
      createdAt: withdrawal.createdAt,
      completedAt: withdrawal.completedAt || undefined,
      failureReason: withdrawal.failureReason || undefined,
    };
  }
}
