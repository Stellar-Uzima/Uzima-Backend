import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  NotificationDeliveryLog,
  DeliveryStatus,
} from './entities/notification-delivery-log.entity';
import { InAppNotification, DeliveryChannel } from './entities/in-app-notification.entity';
import { RetryJobData } from './channel-router.service';
import {
  NOTIFICATION_CENTER_QUEUE,
  RETRY_DELIVERY_JOB,
} from './constants/notification-center.constants';

/**
 * Delivery reliability sweeper.
 *
 * ## Role
 * The happy-path retry pipeline (see `ChannelRouterService`) only re-queues a
 * delivery when a *live* actor (the route call or a retry job) observes a
 * failure. If the process crashes between attempts -- or a queue worker is
 * down while a delivery is stuck in `PENDING` -- nothing would ever pick that
 * log back up. `DeliverySweeperService` is the backstop: it periodically
 * reconciles stale delivery logs and guarantees every in-app notification
 * with a failing channel either converges (retry) or is escalated and
 * flagged for operational review.
 *
 * ## Acceptance criteria covered:
 * - Notifications are persisted **before** they are marked as delivered
 *   (the in-app record is created first in `NotificationCenterService`; this
 *   sweeper never touches that ordering).
 * - Unread retrieval never loses state (the inbox/sweep paths are
 *   read-only with respect to `readAt`).
 * - Delivery failures are **retried or flagged with operational logs**:
 *   logs stuck in `PENDING`/`FAILED` inside the retry window are re-queued;
 *   deliveries that exhausted `MAX_DELIVERY_ATTEMPTS` are transitioned to
 *   `ESCALATED` and produce a loud operational error line.
 *
 * ## Schedule
 * Runs every 5 minutes (`EVERY_5_MINUTES`). A no-op when there is nothing
 * stale. Overlapping runs are prevented with an in-process guard.
 *
 * ## Configuration (via `notification-retry-policy.config.ts`):
 * - `NOTIFICATION_RETRY_MAX_ATTEMPTS` - total attempts before escalation.
 * - `NOTIFICATION_RETRY_BASE_DELAY_MS` - exponential backoff base.
 * - `NOTIFICATION_RETRY_TERMINAL_FAILURE_STRATEGY` - `escalate` | `silent` | `drop`.
 * - `NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD` - consecutive failures before circuit opens.
 * - `NOTIFICATION_CIRCUIT_RESET_MS` - circuit cooldown.
 * - `NOTIFICATION_DELIVERY_STALE_MS` - age threshold for stale log requeue.
 * - `NOTIFICATION_SWEEP_BATCH` - max logs per run.
 */
@Injectable()
export class DeliverySweeperService {
  private readonly logger = new Logger(DeliverySweeperService.name);
  private running = false;

  constructor(
    @InjectRepository(InAppNotification)
    private readonly notificationRepo: Repository<InAppNotification>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryLogRepo: Repository<NotificationDeliveryLog>,
    @InjectQueue(NOTIFICATION_CENTER_QUEUE)
    private readonly retryQueue: Queue<RetryJobData>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Reconciles stale delivery logs: retries anything still inside its retry
   * window and escalates anything that has exhausted its attempts.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepStaleDeliveries(): Promise<void> {
    if (this.running) {
      this.logger.warn('Sweep skipped — previous run still in progress');
      return;
    }
    this.running = true;
    try {
      const requeued = await this.requeueStalePending();
      const escalated = await this.escalateExhausted();
      this.logger.log(
        `Delivery sweep complete: requeued=${requeued} escalated=${escalated}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Delivery sweep failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Finds delivery logs stuck in retryable state and re-queues them with
   * exponential backoff, so a crash between attempts never strands a
   * notification.
   */
  private async requeueStalePending(): Promise<number> {
    const staleWindowMs = this.configService.get<number>(
      'NOTIFICATION_DELIVERY_STALE_MS',
      300_000,
    );
    const batchSize = this.configService.get<number>('NOTIFICATION_SWEEP_BATCH', 200);
    const cutoff = new Date(Date.now() - Number(staleWindowMs));

    const staleLogs = await this.deliveryLogRepo
      .createQueryBuilder('dl')
      .where('dl.status IN (:...retryable)', {
        retryable: [DeliveryStatus.PENDING, DeliveryStatus.FAILED],
      })
      .andWhere('dl.attempts < :maxAttempts', { maxAttempts: this.getMaxAttempts() })
      .andWhere('(dl.attemptedAt IS NULL OR dl.attemptedAt < :cutoff)', { cutoff })
      .orderBy('dl.attemptedAt', 'ASC')
      .addOrderBy('dl.createdAt', 'ASC')
      .take(batchSize)
      .getMany();

    let requeued = 0;
    for (const log of staleLogs) {
      const notification = await this.notificationRepo.findOne({
        where: { id: log.notificationId },
      });
      if (!notification) {
        // The parent in-app record is gone — keep the log marked failed and
        // flag it so support sees the dangling channel attempt.
        await this.deliveryLogRepo.update(log.id, {
          status: DeliveryStatus.FAILED,
          errorMessage: `Sweeper: parent notification ${log.notificationId} not found`,
          attemptedAt: new Date(),
        });
        this.logger.warn(
          `Sweeper: flagged dangling delivery log=${log.id} notification=${log.notificationId}`,
        );
        continue;
      }

      const nextAttempt = log.attempts + 1;
      await this.retryQueue.add(
        RETRY_DELIVERY_JOB,
        {
          notificationId: notification.id,
          logId: log.id,
          channel: log.channel as DeliveryChannel,
          userId: notification.userId,
          title: notification.title,
          body: notification.body,
          attempt: nextAttempt,
        },
        {
          delay: this.getRetryDelayMs(nextAttempt),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
      await this.deliveryLogRepo.update(log.id, {
        status: DeliveryStatus.PENDING,
        attempts: nextAttempt,
        attemptedAt: new Date(),
        errorMessage: null,
      });
      requeued += 1;
      this.logger.log(
        `Sweeper requeued delivery log=${log.id} channel=${log.channel} attempt=${nextAttempt}`,
      );
    }

    return requeued;
  }

  /**
   * Escalates deliveries that exhausted `NOTIFICATION_RETRY_MAX_ATTEMPTS` but
   * were never marked `ESCALATED`, and emits an operational error line that
   * surfaces in the platform's log ingestion.
   */
  private async escalateExhausted(): Promise<number> {
    const batchSize = this.configService.get<number>('NOTIFICATION_SWEEP_BATCH', 200);
    const exhausted = await this.deliveryLogRepo.find({
      where: {
        status: DeliveryStatus.FAILED,
        escalatedAt: IsNull(),
      },
      take: batchSize,
    });

    let escalated = 0;
    const signatures: Array<string> = [];
    for (const log of exhausted) {
      const reason =
        log.errorMessage ?? 'Delivery exhausted all retry attempts without acknowledgement';
      await this.deliveryLogRepo.update(log.id, {
        status: DeliveryStatus.ESCALATED,
        escalatedAt: new Date(),
        escalatedReason: reason,
      });
      escalated += 1;
      signatures.push(`log=${log.id} channel=${log.channel}`);
      this.logger.error(
        `ESCALATED delivery: notification=${log.notificationId} channel=${log.channel} attempts=${log.attempts} reason="${reason}"`,
      );
    }

    if (escalated > 0) {
      this.logger.error(
        `Operational alert: ${escalated} notification delivery(ies) escalated — ${signatures.join(', ')}`,
      );
    }
    return escalated;
  }

  /** Read the configured max attempts (with fallback). */
  private getMaxAttempts(): number {
    return this.configService.get<number>('NOTIFICATION_RETRY_MAX_ATTEMPTS', 3);
  }

  /** Exponential backoff: base * 2^attempt. */
  private getRetryDelayMs(attempt: number): number {
    const base = this.configService.get<number>('NOTIFICATION_RETRY_BASE_DELAY_MS', 1_000);
    return base * Math.pow(2, attempt);
  }
}
