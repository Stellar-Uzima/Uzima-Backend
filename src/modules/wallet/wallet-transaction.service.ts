import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThan, MoreThanOrEqual, Between, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import StellarSdk from 'stellar-sdk';
import { WalletTransaction, WalletTransactionType, WalletTransactionStatus } from '../../database/entities/wallet-transaction.entity';
import { User } from '../../entities/user.entity';
import { WalletService } from './wallet.service';
import { StellarService } from '../../stellar/stellar.service';
import { SavingsService } from './savings.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResource } from '@/audit/entities/audit-log.entity';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import { assertValidStatusTransition } from './wallet-transaction-status';
import { assertValidWalletAmount } from './wallet-amount.util';
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
    private readonly auditService: AuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Get user's wallet transaction history with pagination, filters and
   * stable ordering (createdAt, id). User-scoped: only the caller's own
   * transactions are ever returned.
   */
  async getTransactions(
    userId: string,
    query: WalletTransactionListQueryDto,
  ): Promise<PaginatedResponseDto<WalletTransactionResponseDto>> {
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

    const sortDirection: 'ASC' | 'DESC' = query.sort === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy('tx.createdAt', sortDirection);
    // Tie-break on id keeps pagination stable when createdAt collides.
    qb.addOrderBy('tx.id', 'DESC');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [transactions, totalCount] = await qb.getManyAndCount();

    return new PaginatedResponseDto<WalletTransactionResponseDto>(
      transactions.map((t) => this.mapTransactionToResponse(t)),
      totalCount,
      page,
      limit,
    );
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
    assertValidWalletAmount(dto.amount);

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
    assertValidStatusTransition(transaction.status, WalletTransactionStatus.COMPLETED);

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

    const confirmed = await this.dataSource.transaction(async (manager) => {
      const transactionRepository = manager.getRepository(WalletTransaction);
      const userRepository = manager.getRepository(User);
      const lockedTransaction = await transactionRepository.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedTransaction) {
        throw new NotFoundException('Transaction not found');
      }
      if (lockedTransaction.status !== WalletTransactionStatus.PENDING) {
        throw new BadRequestException(
          `Transaction is not pending (current: ${lockedTransaction.status})`,
        );
      }
      assertValidStatusTransition(
        lockedTransaction.status,
        WalletTransactionStatus.COMPLETED,
      );

      const lockedUser = await userRepository.findOne({
        where: { id: lockedTransaction.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedUser) {
        throw new NotFoundException('User not found');
      }

      lockedUser.walletBalance = parseFloat(
        (lockedUser.walletBalance + lockedTransaction.amount).toFixed(7),
      );
      await userRepository.save(lockedUser);

      lockedTransaction.status = WalletTransactionStatus.COMPLETED;
      lockedTransaction.balanceAfter = lockedUser.walletBalance;
      if (stellarTxHash) {
        lockedTransaction.stellarTxHash = stellarTxHash;
      }
      await transactionRepository.save(lockedTransaction);

      return { transaction: lockedTransaction, user: lockedUser };
    });

    // Invalidate wallet cache
    await this.walletService.invalidateCache({ userId: confirmed.user.id });

    this.eventEmitter.emit('wallet.topup.confirmed', {
      transactionId: confirmed.transaction.id,
      userId: confirmed.user.id,
      amount: confirmed.transaction.amount,
      stellarTxHash,
    });

    this.logger.log(`Top-up confirmed: ${confirmed.transaction.id} for user ${confirmed.user.id}`);

    return this.mapTransactionToResponse(confirmed.transaction);
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
    assertValidStatusTransition(transaction.status, WalletTransactionStatus.FAILED);

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
    assertValidWalletAmount(params.amount, { allowNegative: true });

    const { transaction, user } = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const transactionRepository = manager.getRepository(WalletTransaction);
      const user = await userRepository.findOne({
        where: { id: params.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const balanceBefore = user.walletBalance;
      const balanceAfter = parseFloat((balanceBefore + params.amount).toFixed(7));
      if (params.amount < 0 && balanceAfter < 0) {
        throw new BadRequestException('Insufficient balance');
      }

      const transaction = transactionRepository.create({
        userId: params.userId,
        type: params.type,
        amount: params.amount,
        balanceBefore,
        balanceAfter,
        status: WalletTransactionStatus.COMPLETED,
        referenceId: params.referenceId || null,
        referenceType: params.referenceType || null,
        description: params.description || null,
        sourceAddress: params.sourceAddress || null,
        destinationAddress: params.destinationAddress || null,
        metadata: params.metadata || null,
      });
      await transactionRepository.save(transaction);

      user.walletBalance = balanceAfter;
      await userRepository.save(user);
      return { transaction, user };
    });

    // Invalidate wallet cache
    await this.walletService.invalidateCache({ userId: user.id });

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
      .andWhere('tx.status IN (:...statuses)', {
        statuses: [WalletTransactionStatus.CONFIRMED, WalletTransactionStatus.COMPLETED],
      })
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

  /**
   * Cancel a pending wallet transaction. Only the owner may cancel their own
   * PENDING transaction; no balance is adjusted because pending rows never
   * moved funds. The original row is kept for audit (status -> CANCELLED).
   */
  async cancelTransaction(userId: string, transactionId: string): Promise<WalletTransactionResponseDto> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const transactionRepository = manager.getRepository(WalletTransaction);
      const lockedTransaction = await transactionRepository.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedTransaction || lockedTransaction.userId !== userId) {
        throw new NotFoundException('Transaction not found');
      }
      if (lockedTransaction.status !== WalletTransactionStatus.PENDING) {
        throw new BadRequestException(
          `Only pending transactions can be cancelled (current: ${lockedTransaction.status})`,
        );
      }
      assertValidStatusTransition(lockedTransaction.status, WalletTransactionStatus.CANCELLED);

      lockedTransaction.status = WalletTransactionStatus.CANCELLED;
      lockedTransaction.failureReason = lockedTransaction.failureReason ?? 'Cancelled by user';
      return transactionRepository.save(lockedTransaction);
    });

    await this.walletService.invalidateCache({ userId });

    await this.auditService.logEvent({
      userId,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.TRANSACTION,
      resourceId: cancelled.id,
      description: 'Wallet transaction cancelled by owner',
      newValues: { status: WalletTransactionStatus.CANCELLED },
    });

    this.logger.log(`Transaction cancelled: ${cancelled.id} by user ${userId}`);

    return this.mapTransactionToResponse(cancelled);
  }

  /**
   * Reverse a settled wallet transaction via a compensating ledger entry.
   *
   * The original row is never deleted: it is locked, transitioned to
   * REVERSED and stamped with the actor. A single COMPLETED compensating row
   * (same type, negated amount, originalTransactionId set) moves the balance
   * back; a unique index on original_transaction_id guarantees at most one
   * reversal per transaction. Reversing a credit debits the wallet and fails
   * with 400 when funds are insufficient.
   */
  async reverseTransaction(
    transactionId: string,
    params: { reversedByUserId: string; reversedByRole?: string; reason?: string },
  ): Promise<{ original: WalletTransactionResponseDto; reversal: WalletTransactionResponseDto }> {
    const { original, reversal, subjectUserId, previousStatus } = await this.dataSource.transaction(async (manager) => {
      const transactionRepository = manager.getRepository(WalletTransaction);
      const userRepository = manager.getRepository(User);

      const lockedOriginal = await transactionRepository.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedOriginal) {
        throw new NotFoundException('Transaction not found');
      }
      const previousStatus = lockedOriginal.status;
      if (lockedOriginal.status === WalletTransactionStatus.REVERSED) {
        throw new BadRequestException('Transaction has already been reversed');
      }
      assertValidStatusTransition(lockedOriginal.status, WalletTransactionStatus.REVERSED);

      const existingReversal = await transactionRepository.findOne({
        where: { originalTransactionId: lockedOriginal.id },
      });
      if (existingReversal) {
        throw new BadRequestException('Transaction has already been reversed');
      }

      const lockedUser = await userRepository.findOne({
        where: { id: lockedOriginal.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedUser) {
        throw new NotFoundException('User not found');
      }

      const originalAmount = Number(lockedOriginal.amount);
      const reversalAmount = parseFloat((-originalAmount).toFixed(7));
      assertValidWalletAmount(reversalAmount, { allowNegative: true });

      const balanceBefore = Number(lockedUser.walletBalance);
      const balanceAfter = parseFloat((balanceBefore + reversalAmount).toFixed(7));
      if (balanceAfter < 0) {
        throw new BadRequestException(
          'Insufficient balance: cannot reverse a credit whose funds are no longer available',
        );
      }

      const reversalRow = transactionRepository.create({
        userId: lockedOriginal.userId,
        type: lockedOriginal.type,
        amount: reversalAmount,
        balanceBefore,
        balanceAfter,
        status: WalletTransactionStatus.COMPLETED,
        originalTransactionId: lockedOriginal.id,
        referenceId: lockedOriginal.referenceId,
        referenceType: 'wallet_transaction_reversal',
        description: params.reason
          ? `Reversal of transaction ${lockedOriginal.id}: ${params.reason}`
          : `Reversal of transaction ${lockedOriginal.id}`,
        metadata: {
          reversalOf: lockedOriginal.id,
          reversedBy: params.reversedByUserId,
          reason: params.reason ?? null,
        },
      });
      const savedReversal = await transactionRepository.save(reversalRow);

      lockedOriginal.status = WalletTransactionStatus.REVERSED;
      lockedOriginal.reversedById = params.reversedByUserId;
      const savedOriginal = await transactionRepository.save(lockedOriginal);

      lockedUser.walletBalance = balanceAfter;
      await userRepository.save(lockedUser);

      return {
        original: savedOriginal,
        reversal: savedReversal,
        subjectUserId: lockedOriginal.userId,
        previousStatus,
      };
    });

    await this.walletService.invalidateCache({ userId: subjectUserId });

    this.eventEmitter.emit('wallet.transaction.reversed', {
      transactionId: original.id,
      reversalTransactionId: reversal.id,
      userId: subjectUserId,
      amount: Number(reversal.amount),
      reversedBy: params.reversedByUserId,
    });

    await this.auditService.logEvent({
      userId: params.reversedByUserId,
      userRole: params.reversedByRole,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.TRANSACTION,
      resourceId: original.id,
      description: `Wallet transaction reversed via compensating entry ${reversal.id}`,
      oldValues: { status: previousStatus },
      newValues: {
        status: WalletTransactionStatus.REVERSED,
        reversalTransactionId: reversal.id,
      },
      metadata: {
        subjectUserId,
        amount: Number(reversal.amount),
        reason: params.reason ?? null,
      },
      isComplianceEvent: true,
      complianceCategory: 'WALLET_REVERSAL',
    });

    this.logger.log(
      `Transaction reversed: ${original.id} -> ${reversal.id} by ${params.reversedByUserId}`,
    );

    return {
      original: this.mapTransactionToResponse(original),
      reversal: this.mapTransactionToResponse(reversal),
    };
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
      originalTransactionId: tx.originalTransactionId ?? undefined,
      reversedById: tx.reversedById ?? undefined,
      metadata: tx.metadata,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }
}