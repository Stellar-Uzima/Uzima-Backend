import { Injectable } from '@common/decorators/injectable.decorator';
import { Injectable as NestInjectable } from '@nestjs/common';
import { InjectRepository } from '@typeorm/nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OutboxEventEntity, OutboxEventStatus } from '@database/entities/outbox-event.entity';

export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  availableAt?: Date;
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepository: Repository<OutboxEventEntity>,
  ) {}

  /**
   * Enqueues an event within the caller's transaction so domain changes
   * and the outbox record commit atomically.
   */
  async enqueue(
    manager: EntityManager,
    event: OutboxEventInput,
  ): Promise<OutboxEventEntity> {
    const repository = manager.getRepository(OutboxEventEntity);
    const record = repository.create({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      idempotencyKey: event.idempotencyKey ?? null,
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      availableAt: event.availableAt ?? new Date(),
    });
    return repository.save(record);
  }

  /**
   * Convenience wrapper that runs the supplied work in a transaction and
   * enqueues the event in the same transaction.
   */
  async withTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
    events: OutboxEventInput[],
  ): Promise<T> {
    return this.outboxRepository.manager.transaction(async (manager) => {
      const result = await work(manager);
      for (const event of events) {
        await this.enqueue(manager, event);
      }
      return result;
    });
  }

  async fetchPending(limit = 50): Promise<OutboxEventEntity[]> {
    return this.outboxRepository
      .createQueryBuilder('o')
      .where('o.status = :status', { status: OutboxEventStatus.PENDING })
      .andWhere('o.availableAt <= :now', { now: new Date() })
      .orderBy('o.availableAt', 'ASC')
      .limit(limit)
      .getMany();
  }

  async markPublished(id: string): Promise<void> {
    await this.outboxRepository.update(id, {
      status: OutboxEventStatus.PUBLISHED,
      publishedAt: new Date(),
      lastError: null,
    });
  }

  async markFailed(
    id: string,
    error: string,
    nextAvailableAt: Date,
  ): Promise<void> {
    await this.outboxRepository
      .createQueryBuilder()
      .update(OutboxEventEntity)
      .set({
        status: OutboxEventStatus.PENDING,
        lastError: error.slice(0, 4000),
        availableAt: nextAvailableAt,
      })
      .where('id = :id', { id })
      .execute();
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.outboxRepository.increment({ id }, 'attempts', 1);
  }
}
