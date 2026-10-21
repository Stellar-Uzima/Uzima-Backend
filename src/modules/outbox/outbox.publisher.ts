import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxEventEntity } from '@database/entities/outbox-event.entity';

export const OUTBOX_EVENT_CHANNEL = 'outbox.event';

export interface OutboxDelivery {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  attempts: number;
  occurredAt: string;
}

@Injectable()
export class OutboxPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Delivers an outbox record to its consumers. Throws on failure so the
   * processor can retry with backoff. Delivery is at-least-once; consumers
   * deduplicate using the provided idempotencyKey / event id.
   */
  async publish(event: OutboxEventEntity): Promise<void> {
    const delivery: OutboxDelivery = {
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      idempotencyKey: event.idempotencyKey,
      attempts: event.attempts,
      occurredAt: (event.createdAt ?? new Date()).toISOString(),
    };

    // Emit generic channel and type-specific channel for consumers.
    this.eventEmitter.emit(OUTBOX_EVENT_CHANNEL, delivery);
    this.eventEmitter.emit(`Outbox.${event.eventType}`, delivery);
  }
}
