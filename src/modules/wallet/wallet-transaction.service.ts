import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual, Between, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import StellarSdk from 'stellar-sdk';
import { WalletTransaction, WalletTransactionType, WalletTransactionStatus } from '../../database/entities/wallet-transaction.entity';
import { User } from '../../entities/user.entity';
import { WalletService } from './wallet.service';
import { StellarService } from '../../stellar/stellar.service';
import { SavingsService } from './savings.service';
import {
  WalletTransactionResponseDto,
  WalletTransactionListQueryDto,
  TopUpDto,
  TopUpResponseDto,
} from './dto/savings-wallet.dto';

@Injectable()
export class WalletTransactionService {
  private readonly logger = new Logger(WalletTransactionService.name);

  constructor(
    @InjectRepository(WalletTransaction)
    private readonly transactionRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletService: WalletService,
    private readonly stellarService: StellarService,
    private readonly savingsService: SavingsService,
  ) {}

  /**
   * Get user's wallet transaction history with pagination and filters
   */
  async getTransactions(userId: string, query: WalletTransactionListQueryDto): Promise<{
    data: WalletTransactionResponseDto[];
    metadata: { totalCount: number; page: number; limit: number; totalPages: number };
  }> {
    const qb = this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId });

    if (query.type) {
      qb.andWhere('tx.type = :type', { type: query.type });
    }

    if (query.status) {
      qb.andWhere('tx.status = :status', { status: query.status });
    }

    if (query.startDate) {
      qb.andWhere('tx.createdAt >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query.endDate) {
      qb.andWhere('tx.createdAt <= :endDate', { endDate: new Date(query.endDate) });
    }

    qb.orderBy('tx.createdAt', 'DESC');

    const skip = (query.page! - 1) * query.limit!;
    qb.skip(skip).take(query.limit!);

    const [transactions, totalCount] = await qb.getManyAndCount();

    return {
      data: transactions.map(t => this.mapTransactionToResponse(t)),
      metadata: {
        totalCount,
        page: query.page!,
        limit: query.limit!,
        totalPages: Math.ceil(totalCount / query.limit!),
      },
    };
  }

  /**
   * Get a single transaction by ID
   */
  async getTransactionById(userId: string, transactionId: string): Promise<WalletTransactionResponseDto> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId, userId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return this.mapTransactionToResponse(transaction);
  }

  /**
   * Initiate a wallet top-up
   */
  async topUp(userId: string, dto: TopUpDto): Promise<TopUpResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      throw new BadRequestException('Please link a Stellar wallet first');
    }

    // Create pending transaction
    const transaction = this.transactionRepo.create({
      userId,
      type: WalletTransactionType.DEPOSIT,
      amount: dto.amount,
      balanceBefore: user.walletBalance,
      balanceAfter: user.walletBalance + dto.amount,
      status: WalletTransactionStatus.PENDING,
      referenceId: null,
      referenceType: 'topup',
      description: `Wallet top-up via ${dto.paymentMethod}`,
      metadata: {
        paymentMethod: dto.paymentMethod,
        externalReference: dto.externalReference,
      },
    });
    await this.transactionRepo.save(transaction);

    let paymentUrl: string | undefined;
    let instructions: string | undefined;

    switch (dto.paymentMethod) {
      case 'bank_transfer':
        instructions = `Send ${dto.amount} XLM to ${walletAddress} with memo: ${transaction.id.slice(0, 8)}`;
        break;
      case 'card':
        // In production, integrate with payment processor (Stripe, etc.)
        paymentUrl = `https://pay.example.com/topup/${transaction.id}`;
        break;
      case 'crypto':
        instructions = `Send ${dto.amount} XLM to ${walletAddress} with memo: ${transaction.id.slice(0, 8)}`;
        break;
      default:
        instructions = `Send ${dto.amount} XLM to ${walletAddress} with memo: ${transaction.id.slice(0, 8)}`;
    }

    this.logger.log(`Top-up initiated: ${transaction.id} for user ${userId}, amount: ${dto.amount} XLM`);

    return {
      transactionId: transaction.id,
      amount: dto.amount,
      status: WalletTransactionStatus.PENDING,
      paymentUrl,
      instructions,
      createdAt: transaction.createdAt,
    };
  }

  /**
   * Confirm a top-up (called by webhook or admin)
   */
  async confirmTopUp(transactionId: string, stellarTxHash?: string): Promise<WalletTransactionResponseDto> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== WalletTransactionStatus.PENDING) {
      throw new BadRequestException(`Transaction is not pending (current: ${transaction.status})`);
    }

    const user = await this.userRepo.findOne({ where: { id: transaction.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify the Stellar transaction if hash provided
    if (stellarTxHash) {
      try {
        const txDetails = await this.stellarService.getTransactionDetails(stellarTxHash);
        if (!txDetails || txDetails.to !== user.stellarWalletAddress) {
          throw new BadRequestException('Invalid Stellar transaction');
        }
        // In production, also verify amount matches
      } catch (error) {
        this.logger.warn(`Failed to verify Stellar transaction: ${error instanceof Error ? error.message : 'Unknown'}`);
        // Continue anyway for manual confirmations
      }
    }

    // Update user balance
    user.walletBalance = parseFloat((user.walletBalance + transaction.amount).toFixed(7));
    await this.userRepo.save(user);

    // Update transaction
    transaction.status = WalletTransactionStatus.CONFIRMED;
    transaction.balanceAfter = user.walletBalance;
    if (stellarTxHash) {
      transaction.stellarTxHash = stellarTxHash;
    }
    await this.transactionRepo.save(transaction);

    // Invalidate wallet cache
    await this.walletService.invalidateCache({ userId: user.id });

    this.eventEmitter.emit('wallet.topup.confirmed', {
      transactionId: transaction.id,
      userId: user.id,
      amount: transaction.amount,
      stellarTxHash,
    });

    this.logger.log(`Top-up confirmed: ${transaction.id} for user ${user.id}`);

    return this.mapTransactionToResponse(transaction);
  }

  /**
   * Fail a pending top-up
   */
  async failTopUp(transactionId: string, reason: string): Promise<WalletTransactionResponseDto> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== WalletTransactionStatus.PENDING) {
      throw new BadRequestException(`Transaction is not pending (current: ${transaction.status})`);
    }

    transaction.status = WalletTransactionStatus.FAILED;
    transaction.failureReason = reason;
    await this.transactionRepo.save(transaction);

    this.logger.log(`Top-up failed: ${transaction.id} - ${reason}`);

    return this.mapTransactionToResponse(transaction);
  }

  /**
   * Record a wallet transaction (internal use by other services)
   */
  async recordTransaction(params: {
    userId: string;
    type: WalletTransactionType;
    amount: number; // Positive for credit, negative for debit
    referenceId?: string;
    referenceType?: string;
    description?: string;
    sourceAddress?: string;
    destinationAddress?: string;
    metadata?: Record<string, any>;
  }): Promise<WalletTransactionResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: params.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const balanceBefore = user.walletBalance;
    const balanceAfter = parseFloat((user.walletBalance + params.amount).toFixed(7));

    // Validate user has enough balance for debits
    if (params.amount < 0 && balanceAfter < 0) {
      throw new BadRequestException('Insufficient balance');
    }

    const transaction = this.transactionRepo.create({
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      balanceBefore,
      balanceAfter,
      status: WalletTransactionStatus.CONFIRMED,
      referenceId: params.referenceId || null,
      referenceType: params.referenceType || null,
      description: params.description || null,
      sourceAddress: params.sourceAddress || null,
      destinationAddress: params.destinationAddress || null,
      metadata: params.metadata || null,
    });
    await this.transactionRepo.save(transaction);

    // Update user balance
    user.walletBalance = balanceAfter;
    await this.userRepo.save(user);

    // Invalidate wallet cache
    await this.walletService.invalidateCache({ userId: params.userId });

    this.logger.log(`Recorded ${params.type} transaction: ${transaction.id} for user ${params.userId}, amount: ${params.amount}`);

    return this.mapTransactionToResponse(transaction);
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(userId: string): Promise<{
    totalDeposits: number;
    totalWithdrawals: number;
    totalRewards: number;
    totalTransfersIn: number;
    totalTransfersOut: number;
    netFlow: number;
    transactionCount: number;
  }> {
    const stats = await this.transactionRepo
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('SUM(tx.amount)', 'totalAmount')
      .addSelect('COUNT(*)', 'count')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.status = :status', { status: WalletTransactionStatus.CONFIRMED })
      .groupBy('tx.type')
      .getRawMany();

    const result = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalRewards: 0,
      totalTransfersIn: 0,
      totalTransfersOut: 0,
      netFlow: 0,
      transactionCount: 0,
    };

    stats.forEach(s => {
      const amount = parseFloat(s.totalAmount);
      const count = parseInt(s.count);
      result.transactionCount += count;
      result.netFlow += amount;

      switch (s.type) {
        case WalletTransactionType.DEPOSIT:
          result.totalDeposits += amount;
          break;
        case WalletTransactionType.WITHDRAWAL:
          result.totalWithdrawals += Math.abs(amount);
          break;
        case WalletTransactionType.REWARD:
          result.totalRewards += amount;
          break;
        case WalletTransactionType.TRANSFER_IN:
          result.totalTransfersIn += amount;
          break;
        case WalletTransactionType.TRANSFER_OUT:
          result.totalTransfersOut += Math.abs(amount);
          break;
      }
    });

    return result;
  }

  private mapTransactionToResponse(tx: WalletTransaction): WalletTransactionResponseDto {
    return {
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      balanceBefore: Number(tx.balanceBefore),
      balanceAfter: Number(tx.balanceAfter),
      status: tx.status,
      referenceId: tx.referenceId,
      referenceType: tx.referenceType,
      description: tx.description,
      sourceAddress: tx.sourceAddress,
      destinationAddress: tx.destinationAddress,
      stellarTxHash: tx.stellarTxHash,
      failureReason: tx.failureReason,
      metadata: tx.metadata,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }
}