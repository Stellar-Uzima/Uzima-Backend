import { Injectable, Logger } from '@common';
import { Interval } from '@nestjs/schedule';
import { DataSource, LessThanOrEqual } from 'typeorm';

import { OutboxEventEntity, OutboxEventStatus } from '@database/entities/outbox-event.entity';
import { OutboxPublisher } from './outbox.publisher';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly publisher: OutboxPublisher,
  ) {}

  @Interval(5000)
  async processOutbox(): Promise<void> {
    await this.releaseStaleLocks();

    const events = await this.dataSource.getRepository(OutboxEventEntity).find({
      where: {
        status: OutboxEventStatus.PENDING,
        availableAt: LessThanOrEqual(new Date()),
      },
      order: { createdAt: 'ASC' },
      take: BATCH_SIZE,
    });

    for (const event of events) {
      await this.dispatch(event);
    }
  }

  private async dispatch(event: OutboxEventEntity): Promise<void> {
    const claimed = await this.claim(event);
    if (!claimed) {
      return;
    }

    try {
      await this.publisher.publish(event);
      await this.dataSource.getRepository(OutboxEventEntity).update(event.id, {
        status: OutboxEventStatus.PUBLISHED,
        publishedAt: new Date(),
        lastError: null,
      });
    } catch (error) {
      await this.scheduleRetry(event, error as Error);
    }
  }

  private async claim(event: OutboxEventEntity): Promise<boolean> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(OutboxEventEntity)
      .set({ status: OutboxEventStatus.PROCESSING })
      .where('id = :id', { id: event.id })
      .andWhere('status = :status', { status: OutboxEventStatus.PENDING })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  private async scheduleRetry(event: OutboxEventEntity, error: Error): Promise<void> {
    const attempts = event.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const delay = Math.min(BASE_RETRY_MS * 2 ** (attempts - 1), MAX_RETRY_MS);

    await this.dataSource.getRepository(OutboxEventEntity).update(event.id, {
      status: exhausted ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING,
      attempts,
      availableAt: new Date(Date.now() + delay),
      lastError: error.message.slice(0, 2000),
    });

    this.logger.warn(
      `Failed to deliver outbox event ${event.id} (attempt ${attempts}/${MAX_ATTEMPTS}): ${error.message}`,
    );
  }

  private async releaseStaleLocks(): Promise<void> {
    const staleBefore = new Date(Date.now() - MAX_RETRY_MS);
    await this.dataSource
      .createQueryBuilder()
      .update(OutboxEventEntity)
      .set({ status: OutboxEventStatus.PENDING })
      .where('status = :status', { status: OutboxEventStatus.PROCESSING })
      .andWhere('availableAt < :staleBefore', { staleBefore })
      .execute();
  }
}
