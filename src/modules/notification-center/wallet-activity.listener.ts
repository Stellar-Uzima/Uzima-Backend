import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import {
  InAppNotification,
  NotificationTypeEnum,
} from './entities/in-app-notification.entity';
import { Withdrawal } from '../wallet/entities/withdrawal.entity';
import { WithdrawalStatus } from '../wallet/dto/withdrawal.dto';

interface TopupConfirmedEvent {
  transactionId: string;
  userId: string;
  amount: number | string;
  stellarTxHash: string;
}

interface WithdrawalStatusChangedEvent {
  withdrawalId: string;
  userId: string;
  previousStatus: string;
  newStatus: string;
  transactionHash?: string | null;
  failureReason?: string | null;
}

interface TransferCompletedEvent {
  transactionId: string;
  senderId: string;
  recipientId: string;
  amount: number | string;
}

interface SavingsContributionConfirmedEvent {
  contributionId: string;
  goalId: string;
  userId: string;
  amount: number | string;
}

interface NotifyInput {
  userId: string;
  dedupeKey: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Turns confirmed wallet events into preference-aware in-app notifications
 * (#1534). Handlers are fire-and-forget (`async: true`) and never throw, so
 * notification failures cannot block financial processing, and each event is
 * deduplicated by a stable key before it is persisted.
 */
@Injectable()
export class WalletActivityListener {
  private readonly logger = new Logger(WalletActivityListener.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly notificationService: NotificationService,
    @InjectRepository(InAppNotification)
    private readonly notificationRepo: Repository<InAppNotification>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Notifies the wallet owner that a top-up reached confirmed state. */
  @OnEvent('wallet.topup.confirmed', { async: true })
  async onTopupConfirmed(event: TopupConfirmedEvent): Promise<void> {
    try {
      if (!event?.userId || !event?.transactionId) return;
      const amount = formatAmount(event.amount);
      await this.notifyOnce({
        userId: String(event.userId),
        dedupeKey: `topup:${event.transactionId}`,
        title: 'Wallet top-up confirmed',
        body: amount
          ? `Your wallet top-up of ${amount} XLM has been confirmed.`
          : 'Your wallet top-up has been confirmed.',
        data: {
          transactionId: event.transactionId,
          amount: event.amount,
          stellarTxHash: event.stellarTxHash ?? null,
        },
      });
    } catch (err: unknown) {
      this.logFailure('wallet.topup.confirmed', err);
    }
  }

  /** Notifies the wallet owner when a withdrawal reaches a terminal status. */
  @OnEvent('wallet.withdrawal.status_changed', { async: true })
  async onWithdrawalStatusChanged(
    event: WithdrawalStatusChangedEvent,
  ): Promise<void> {
    try {
      if (!event?.userId || !event?.withdrawalId) return;
      const newStatus = String(event.newStatus ?? '').toUpperCase();
      if (
        newStatus === WithdrawalStatus.PENDING ||
        newStatus === WithdrawalStatus.PROCESSING
      ) {
        return;
      }

      const amount = await this.fetchWithdrawalAmount(event.withdrawalId);
      const amountText = formatAmount(amount);
      const failed =
        newStatus === WithdrawalStatus.FAILED ||
        newStatus === WithdrawalStatus.REJECTED;
      const reason =
        typeof event.failureReason === 'string' && event.failureReason.trim()
          ? event.failureReason.trim()
          : null;
      const subject = amountText
        ? `Your withdrawal of ${amountText} XLM`
        : 'Your withdrawal';
      const outcome =
        newStatus === WithdrawalStatus.COMPLETED
          ? 'is complete'
          : newStatus === WithdrawalStatus.FAILED
            ? 'failed'
            : 'was rejected';

      await this.notifyOnce({
        userId: String(event.userId),
        dedupeKey: `withdrawal:${event.withdrawalId}:${newStatus}`,
        title: failed
          ? `Withdrawal ${newStatus.toLowerCase()}`
          : 'Withdrawal completed',
        body: `${subject} ${outcome}${failed && reason ? `: ${reason}` : '.'}`,
        data: {
          withdrawalId: event.withdrawalId,
          previousStatus: event.previousStatus,
          newStatus,
          amount: amount ?? null,
          transactionHash: event.transactionHash ?? null,
          failureReason: reason,
        },
      });
    } catch (err: unknown) {
      this.logFailure('wallet.withdrawal.status_changed', err);
    }
  }

  /** Notifies both sides of a completed transfer. */
  @OnEvent('wallet.transfer.completed', { async: true })
  async onTransferCompleted(event: TransferCompletedEvent): Promise<void> {
    try {
      if (!event?.transactionId) return;
      const amountText = formatAmount(event.amount);
      const subject = amountText ? `${amountText} XLM` : 'funds';

      if (event.senderId) {
        await this.notifyOnce({
          userId: String(event.senderId),
          dedupeKey: `transfer:${event.transactionId}:sender`,
          title: 'Transfer sent',
          body: `You sent ${subject}.`,
          data: {
            transactionId: event.transactionId,
            amount: event.amount,
            direction: 'outgoing',
          },
        });
      }
      if (event.recipientId) {
        await this.notifyOnce({
          userId: String(event.recipientId),
          dedupeKey: `transfer:${event.transactionId}:recipient`,
          title: 'Transfer received',
          body: `You received ${subject}.`,
          data: {
            transactionId: event.transactionId,
            amount: event.amount,
            direction: 'incoming',
          },
        });
      }
    } catch (err: unknown) {
      this.logFailure('wallet.transfer.completed', err);
    }
  }

  /** Notifies the saver that a contribution reached confirmed state. */
  @OnEvent('savings.contribution.confirmed', { async: true })
  async onSavingsContributionConfirmed(
    event: SavingsContributionConfirmedEvent,
  ): Promise<void> {
    try {
      if (!event?.userId || !event?.contributionId) return;
      const amount = formatAmount(event.amount);
      await this.notifyOnce({
        userId: String(event.userId),
        dedupeKey: `savings-contribution:${event.contributionId}`,
        title: 'Savings contribution confirmed',
        body: amount
          ? `Your contribution of ${amount} XLM to your savings goal has been confirmed.`
          : 'Your savings contribution has been confirmed.',
        data: {
          contributionId: event.contributionId,
          goalId: event.goalId,
          amount: event.amount,
        },
      });
    } catch (err: unknown) {
      this.logFailure('savings.contribution.confirmed', err);
    }
  }

  /**
   * Creates the notification once per event key: an in-process guard covers
   * concurrent duplicates and a stored `dedupeKey` covers replays (#1534).
   */
  private async notifyOnce(input: NotifyInput): Promise<void> {
    const key = `${input.userId}:${input.dedupeKey}`;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    try {
      const existing = await this.notificationRepo
        .createQueryBuilder('n')
        .where('n.userId = :userId', { userId: input.userId })
        .andWhere('n.type = :type', { type: NotificationTypeEnum.WALLET_ACTIVITY })
        .andWhere("n.data->>'dedupeKey' = :dedupeKey", {
          dedupeKey: input.dedupeKey,
        })
        .getOne();
      if (existing) return;

      await this.notificationService.createNotification({
        userId: input.userId,
        type: NotificationTypeEnum.WALLET_ACTIVITY,
        title: input.title,
        body: input.body,
        data: { ...input.data, dedupeKey: input.dedupeKey },
      });
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async fetchWithdrawalAmount(withdrawalId: string): Promise<number | null> {
    if (!this.dataSource.hasMetadata(Withdrawal)) return null;
    const withdrawal = await this.dataSource
      .getRepository(Withdrawal)
      .findOne({ where: { id: withdrawalId } });
    return withdrawal ? Number(withdrawal.amount) : null;
  }

  private logFailure(eventName: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `Wallet activity notification failed for ${eventName}: ${message}`,
    );
  }
}

/** Formats an amount to at most 7 decimals, trimming trailing zeros (#1534). */
function formatAmount(amount: unknown): string | null {
  const numeric =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string'
        ? Number.parseFloat(amount)
        : NaN;
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
}
