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
import { DataSource, MoreThan, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
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
import { Withdrawal } from './entities/withdrawal.entity';
import {
  CreateWithdrawalDto,
  WithdrawalListQueryDto,
  WithdrawalResponseDto,
  WithdrawalStatus,
} from './dto/withdrawal.dto';
import { TaskCompletion, TaskCompletionStatus } from '../../tasks/entities/task-completion.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditResource } from '../../audit/entities/audit-log.entity';
import { NotificationService } from '../notification-center/notification.service';
import { NotificationTypeEnum } from '../notification-center/entities/in-app-notification.entity';
import { Role } from '../auth/enums/role.enum';
import { WalletTransaction, WalletTransactionStatus, WalletTransactionType } from '../../database/entities/wallet-transaction.entity';
import {
  WalletLedgerEntry,
  WalletLedgerDirection,
  WalletLedgerEntryType,
} from './entities/wallet-ledger-entry.entity';
import { WalletIdempotencyKey } from './entities/wallet-idempotency-key.entity';
import { recordLedgerEntry, toLedgerAmount } from './ledger/wallet-ledger.helper';
import {
  IdempotencyClaimedError,
  claimIdempotencyKey,
  finalizeIdempotencyKey,
  resolveStoredResult,
} from './ledger/idempotency.helper';
import { TransferWalletDto, TransferResponseDto } from './dto/transfer-wallet.dto';
import { LedgerEntriesQueryDto, LedgerPageResponseDto } from './dto/wallet-ledger.dto';
import {
  ReconciliationQueryDto,
  ReconciliationReportDto,
  UserReconciliationDto,
} from './dto/wallet-reconciliation.dto';

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
    @InjectDataSource() private dataSource: DataSource,
    private auditService: AuditService,
    private notificationService: NotificationService
  ) {}

  async recoverTransactions(userId: string, adminId: string) {
    const recovery = await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const transactions = manager.getRepository(RewardTransaction);
      const completions = manager.getRepository(TaskCompletion);

      const user = await users.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const transactionRows = await transactions.find({ where: { userId } });
      const suspiciousTransactions = transactionRows
        .filter((transaction) => {
          if (transaction.status === RewardStatus.FAILED) {
            return true;
          }
          if (transaction.status === RewardStatus.SUCCESS && !transaction.stellarTxHash) {
            return true;
          }
          return (
            transaction.status === RewardStatus.PENDING &&
            Date.now() - new Date(transaction.createdAt).getTime() > 15 * 60 * 1000
          );
        })
        .map((transaction) => ({
          id: transaction.id,
          taskCompletionId: transaction.taskCompletionId,
          amount: transaction.amount,
          status: transaction.status,
          reason:
            transaction.status === RewardStatus.FAILED
              ? 'Payout processing failed'
              : transaction.status === RewardStatus.SUCCESS
                ? 'Successful transaction is missing its Stellar transaction hash'
                : 'Transaction has remained pending for more than 15 minutes',
        }));

      const completedTasks = await completions.find({
        where: {
          userId,
          status: TaskCompletionStatus.VERIFIED,
          xlmRewarded: MoreThan(0),
        },
      });
      const recoveredTransactions: RewardTransaction[] = [];

      for (const completion of completedTasks) {
        const lockedCompletion = await completions.findOne({
          where: { id: completion.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedCompletion) {
          continue;
        }

        const existing = await transactions.findOne({
          where: { userId, taskCompletionId: lockedCompletion.id },
        });
        if (existing) {
          continue;
        }

        const recovered = transactions.create({
          userId,
          taskCompletionId: lockedCompletion.id,
          amount: lockedCompletion.xlmRewarded,
          status: RewardStatus.FAILED,
          attempts: 0,
        });
        recoveredTransactions.push(await transactions.save(recovered));
      }

      return { user, suspiciousTransactions, recoveredTransactions };
    });

    const recoveredCount = recovery.recoveredTransactions.length;
    const suspiciousCount = recovery.suspiciousTransactions.length;
    this.logger.warn(
      `Wallet recovery for user ${userId}: restored ${recoveredCount} missing ledger row(s); found ${suspiciousCount} suspicious transaction(s). No Stellar payments were submitted.`
    );

    await this.auditService.logEvent({
      userId: adminId,
      userRole: Role.ADMIN,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.TRANSACTION,
      resourceId: userId,
      description: `Wallet transaction recovery: restored ${recoveredCount} missing ledger row(s); found ${suspiciousCount} suspicious transaction(s). No funds were transferred.`,
      isSensitive: true,
      isComplianceEvent: true,
      complianceCategory: 'WALLET_RECOVERY',
      metadata: {
        recoveredTransactionIds: recovery.recoveredTransactions.map(({ id }) => id),
        suspiciousTransactions: recovery.suspiciousTransactions,
      },
    });

    if (recoveredCount > 0) {
      await this.notificationService.createNotification({
        userId,
        type: NotificationTypeEnum.REWARD_ALERT,
        title: 'Wallet activity reviewed',
        body: `We restored ${recoveredCount} missing reward record(s) to your wallet history. These records are under review and have not been paid by this recovery. We also identified ${suspiciousCount} transaction(s) that need review.`,
        data: {
          action: 'WALLET_RECOVERY',
          recoveredCount,
          suspiciousCount,
        },
      });
    }

    return {
      userId,
      recoveredTransactions: recovery.recoveredTransactions.map((transaction) => ({
        id: transaction.id,
        taskCompletionId: transaction.taskCompletionId,
        amount: transaction.amount,
        status: transaction.status,
      })),
      suspiciousTransactions: recovery.suspiciousTransactions,
      paymentsSubmitted: 0,
    };
  }

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
      this.logger.warn(`Failed to fetch balance for ${walletAddress}: ${message}`);
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
      liveBalance !== 'unavailable' ? (parseFloat(liveBalance) * xlmUsdRate).toFixed(2) : '0.00';

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
        'Stellar account not found on the network. Please ensure it is funded.'
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
      throw new ConflictException('This Stellar address is already linked to another account');
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
    type?: string
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
   * Create a new withdrawal request.
   * When an Idempotency-Key is supplied, retries replay the original result
   * instead of creating a second withdrawal.
   */
  async createWithdrawal(
    userId: string,
    dto: CreateWithdrawalDto,
    idempotencyKey?: string,
    requestId?: string,
  ): Promise<WithdrawalResponseDto> {
    const endpoint = 'wallet.withdraw';
    const key = idempotencyKey?.trim() || undefined;
    const requestSnapshot = {
      amount: toLedgerAmount(dto.amount),
      destinationAddress: dto.destinationAddress,
      memo: dto.memo?.trim() || null,
    };

    if (key) {
      const stored = await this.findIdempotencyRecord(userId, endpoint, key);
      if (stored) {
        return resolveStoredResult<WithdrawalResponseDto>(stored, requestSnapshot, 'withdrawal');
      }
    }

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

    let created: WithdrawalResponseDto;
    try {
      created = await this.dataSource.transaction(async (manager) => {
        let claimedKeyId: string | null = null;
        if (key) {
          claimedKeyId = await claimIdempotencyKey(manager, {
            userId,
            endpoint,
            idempotencyKey: key,
            requestId: requestId ?? null,
            requestSnapshot,
          });
          if (!claimedKeyId) {
            throw new IdempotencyClaimedError(
              `Idempotency key already claimed for ${endpoint}`,
            );
          }
        }

        const repository = manager.getRepository(Withdrawal);
        const withdrawal = await repository.save(
          repository.create({
            userId,
            amount: dto.amount,
            destinationAddress: dto.destinationAddress,
            memo: dto.memo || null,
            status: WithdrawalStatus.PENDING,
          }),
        );

        const response = this.mapToResponseDto(withdrawal);
        if (key && claimedKeyId) {
          await finalizeIdempotencyKey(manager, claimedKeyId, {
            responseSnapshot: response,
            transactionId: withdrawal.id,
          });
        }
        return response;
      });
    } catch (error) {
      if (key && error instanceof IdempotencyClaimedError) {
        const stored = await this.findIdempotencyRecord(userId, endpoint, key);
        if (stored) {
          return resolveStoredResult<WithdrawalResponseDto>(
            stored,
            requestSnapshot,
            'withdrawal',
          );
        }
      }
      throw error;
    }

    // Emit event for admin notification
    this.eventEmitter.emit('wallet.withdrawal.created', {
      withdrawalId: created.id,
      userId,
      amount: dto.amount,
      destinationAddress: dto.destinationAddress,
    });

    this.logger.log(`Withdrawal created: ${created.id} for user ${userId}, amount: ${dto.amount} XLM`);

    return created;
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

  /**
   * Transfers funds between two wallets in one database transaction: debit,
   * credit, both transfer records, and both ledger legs commit together, and
   * a replayed Idempotency-Key returns the original result without side
   * effects. Emits `wallet.transfer.completed` only after the commit.
   */
  async transfer(
    senderId: string,
    dto: TransferWalletDto,
    idempotencyKey?: string,
    requestId?: string,
  ): Promise<TransferResponseDto> {
    const endpoint = 'wallet.transfer';
    const key = idempotencyKey?.trim() || dto.idempotencyKey?.trim() || undefined;
    const recipientId = dto.recipientId;
    const memo = dto.memo?.trim() || null;
    const amount = toLedgerAmount(dto.amount);
    const requestSnapshot = { recipientId, amount, memo };

    if (key) {
      const stored = await this.findIdempotencyRecord(senderId, endpoint, key);
      if (stored) {
        return resolveStoredResult<TransferResponseDto>(stored, requestSnapshot, 'transfer');
      }
    }

    if (recipientId === senderId) {
      throw new BadRequestException('Cannot transfer to your own wallet');
    }

    let result: TransferResponseDto;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(User);

        let claimedKeyId: string | null = null;
        if (key) {
          claimedKeyId = await claimIdempotencyKey(manager, {
            userId: senderId,
            endpoint,
            idempotencyKey: key,
            requestId: requestId ?? null,
            requestSnapshot,
          });
          if (!claimedKeyId) {
            throw new IdempotencyClaimedError(
              `Idempotency key already claimed for ${endpoint}`,
            );
          }
        }

        const firstId = senderId < recipientId ? senderId : recipientId;
        const secondId = senderId < recipientId ? recipientId : senderId;
        const first = await users.findOne({
          where: { id: firstId },
          lock: { mode: 'pessimistic_write' },
        });
        const second = await users.findOne({
          where: { id: secondId },
          lock: { mode: 'pessimistic_write' },
        });

        const sender = firstId === senderId ? first : second;
        const recipient = firstId === senderId ? second : first;
        if (!sender) {
          throw new NotFoundException('Sender wallet not found');
        }
        if (!recipient) {
          throw new NotFoundException('Recipient not found');
        }

        const senderBalance = toLedgerAmount(Number(sender.walletBalance));
        const recipientBalance = toLedgerAmount(Number(recipient.walletBalance));
        if (senderBalance < amount) {
          throw new BadRequestException(
            `Insufficient balance. Available: ${senderBalance.toFixed(7)} XLM`,
          );
        }

        const senderBalanceAfter = toLedgerAmount(senderBalance - amount);
        const recipientBalanceAfter = toLedgerAmount(recipientBalance + amount);

        const transactions = manager.getRepository(WalletTransaction);
        const senderTransaction = await transactions.save(
          transactions.create({
            userId: sender.id,
            type: WalletTransactionType.TRANSFER_OUT,
            amount: -amount,
            balanceBefore: senderBalance,
            balanceAfter: senderBalanceAfter,
            status: WalletTransactionStatus.CONFIRMED,
            referenceType: 'transfer',
            referenceId: null,
            description: memo || `Transfer to user ${recipient.id}`,
            destinationAddress:
              recipient.stellarWalletAddress || recipient.walletAddress || null,
          }),
        );
        const recipientTransaction = await transactions.save(
          transactions.create({
            userId: recipient.id,
            type: WalletTransactionType.TRANSFER_IN,
            amount,
            balanceBefore: recipientBalance,
            balanceAfter: recipientBalanceAfter,
            status: WalletTransactionStatus.CONFIRMED,
            referenceType: 'transfer',
            referenceId: senderTransaction.id,
            description: memo || `Transfer from user ${sender.id}`,
            sourceAddress:
              sender.stellarWalletAddress || sender.walletAddress || null,
          }),
        );

        sender.walletBalance = senderBalanceAfter;
        recipient.walletBalance = recipientBalanceAfter;
        await users.save([sender, recipient]);

        await recordLedgerEntry(manager, {
          userId: sender.id,
          direction: WalletLedgerDirection.DEBIT,
          amount,
          type: WalletLedgerEntryType.TRANSFER_OUT,
          referenceType: 'wallet_transaction',
          referenceId: senderTransaction.id,
          balanceAfter: senderBalanceAfter,
        });
        await recordLedgerEntry(manager, {
          userId: recipient.id,
          direction: WalletLedgerDirection.CREDIT,
          amount,
          type: WalletLedgerEntryType.TRANSFER_IN,
          referenceType: 'wallet_transaction',
          referenceId: senderTransaction.id,
          balanceAfter: recipientBalanceAfter,
        });

        const response: TransferResponseDto = {
          transactionId: senderTransaction.id,
          senderId: sender.id,
          recipientId: recipient.id,
          amount,
          senderBalanceAfter,
          recipientBalanceAfter,
          createdAt: senderTransaction.createdAt,
        };
        if (key && claimedKeyId) {
          await finalizeIdempotencyKey(manager, claimedKeyId, {
            responseSnapshot: response,
            transactionId: senderTransaction.id,
          });
        }
        return response;
      });
    } catch (error) {
      if (key && error instanceof IdempotencyClaimedError) {
        const stored = await this.findIdempotencyRecord(senderId, endpoint, key);
        if (stored) {
          return resolveStoredResult<TransferResponseDto>(stored, requestSnapshot, 'transfer');
        }
      }
      throw error;
    }

    this.eventEmitter.emit('wallet.transfer.completed', {
      transactionId: result.transactionId,
      senderId: result.senderId,
      recipientId: result.recipientId,
      amount: result.amount,
    });

    this.logger.log(
      `Transfer ${result.transactionId}: ${amount} XLM from ${senderId} to ${recipientId}`,
    );

    return result;
  }

  /**
   * Returns the authenticated user's append-only ledger entries, newest first.
   */
  async getLedgerEntries(
    userId: string,
    query: LedgerEntriesQueryDto,
  ): Promise<LedgerPageResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.dataSource
      .getRepository(WalletLedgerEntry)
      .createQueryBuilder('entry')
      .where('entry.userId = :userId', { userId });

    if (query.type) {
      builder.andWhere('entry.type = :type', { type: query.type });
    }
    if (query.direction) {
      builder.andWhere('entry.direction = :direction', { direction: query.direction });
    }

    builder
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [entries, totalCount] = await builder.getManyAndCount();

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        direction: entry.direction,
        amount: toLedgerAmount(Number(entry.amount)),
        type: entry.type,
        referenceType: entry.referenceType ?? undefined,
        referenceId: entry.referenceId ?? undefined,
        balanceAfter:
          entry.balanceAfter == null
            ? undefined
            : toLedgerAmount(Number(entry.balanceAfter)),
        createdAt: entry.createdAt,
      })),
      metadata: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Compares stored wallet balances with posted ledger entries for selected
   * or all accounts and reports every mismatch. Balances are never modified.
   */
  async getWalletReconciliation(
    query: ReconciliationQueryDto,
    adminId: string,
  ): Promise<ReconciliationReportDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const userId = query.userId ?? null;
    const scope = `FROM users u
      LEFT JOIN (
        SELECT "userId",
               SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS "ledgerBalance",
               COUNT(*) AS "entryCount"
        FROM wallet_ledger_entries
        GROUP BY "userId"
      ) l ON l."userId" = u.id
      WHERE ($1::uuid IS NULL OR u.id = $1)`;
    const driftFilter = `AND ABS(COALESCE(u."walletBalance", 0) - COALESCE(l."ledgerBalance", 0)) > 0.0000001`;

    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT u.id AS "userId",
              COALESCE(u."walletBalance", 0) AS "walletBalance",
              COALESCE(l."ledgerBalance", 0) AS "ledgerBalance",
              COALESCE(l."entryCount", 0) AS "entryCount"
       ${scope}
       ${driftFilter}
       ORDER BY u.id ASC
       LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    );
    const totals: Array<{ totalChecked: number; totalMismatches: number }> =
      await this.dataSource.query(
        `SELECT (SELECT COUNT(*)::int ${scope}) AS "totalChecked",
                (SELECT COUNT(*)::int ${scope} ${driftFilter}) AS "totalMismatches"`,
        [userId],
      );

    const mismatches = rows.map((row) => {
      const walletBalance = toLedgerAmount(Number(row.walletBalance));
      const ledgerBalance = toLedgerAmount(Number(row.ledgerBalance));
      return {
        userId: String(row.userId),
        walletBalance,
        ledgerBalance,
        drift: toLedgerAmount(walletBalance - ledgerBalance),
        entryCount: Number(row.entryCount),
      };
    });
    const report: ReconciliationReportDto = {
      totalChecked: Number(totals[0]?.totalChecked ?? 0),
      totalMismatches: Number(totals[0]?.totalMismatches ?? 0),
      mismatches,
    };

    await this.auditService.logEvent({
      userId: adminId,
      userRole: Role.ADMIN,
      action: AuditAction.VIEW,
      resourceType: AuditResource.TRANSACTION,
      resourceId: userId ?? undefined,
      description: `Wallet ledger reconciliation checked ${report.totalChecked} account(s); ${report.totalMismatches} mismatch(es) reported and no balances were changed`,
      metadata: {
        totalChecked: report.totalChecked,
        totalMismatches: report.totalMismatches,
        mismatchedUserIds: mismatches.map((mismatch) => mismatch.userId),
      },
    });

    return report;
  }

  /**
   * Reports ledger drift for a single account. The balance is reported only;
   * it is never silently corrected.
   */
  async reconcileUserLedger(
    userId: string,
    adminId: string,
  ): Promise<UserReconciliationDto> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const rows: Array<{ ledgerBalance: unknown; entryCount: number }> =
      await this.dataSource.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS "ledgerBalance",
                COUNT(*)::int AS "entryCount"
         FROM wallet_ledger_entries
         WHERE "userId" = $1`,
        [userId],
      );

    const walletBalance = toLedgerAmount(Number(user.walletBalance ?? 0));
    const ledgerBalance = toLedgerAmount(Number(rows[0]?.ledgerBalance ?? 0));
    const drift = toLedgerAmount(walletBalance - ledgerBalance);
    const entryCount = Number(rows[0]?.entryCount ?? 0);

    const report: UserReconciliationDto = {
      userId,
      walletBalance,
      ledgerBalance,
      drift,
      entryCount,
      matched: drift === 0,
    };

    await this.auditService.logEvent({
      userId: adminId,
      userRole: Role.ADMIN,
      action: AuditAction.VIEW,
      resourceType: AuditResource.TRANSACTION,
      resourceId: userId,
      description: `Wallet ledger reconciliation for user ${userId}: drift ${drift} XLM across ${entryCount} ledger entries; balance not modified`,
      metadata: { ...report },
    });

    return report;
  }

  /**
   * Loads a stored idempotency claim scoped to (user, endpoint, key).
   */
  private findIdempotencyRecord(
    userId: string,
    endpoint: string,
    idempotencyKey: string,
  ): Promise<WalletIdempotencyKey | null> {
    return this.dataSource
      .getRepository(WalletIdempotencyKey)
      .findOne({ where: { userId, endpoint, idempotencyKey } });
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
