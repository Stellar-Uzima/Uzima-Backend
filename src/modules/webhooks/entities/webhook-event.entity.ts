import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum WebhookEventStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  RETRYING = 'retrying',
  FAILED = 'failed',
}

@Entity('webhook_events')
@Index(['provider', 'eventId'], { unique: true })
@Index(['status', 'nextAttemptAt'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  provider: string;

  @Column({ name: 'event_id', length: 255 })
  eventId: string;

  @Column({ name: 'event_type', length: 255 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: WebhookEventStatus.RECEIVED })
  status: WebhookEventStatus;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'next_attempt_at', type: 'timestamp with time zone', nullable: true })
  nextAttemptAt: Date | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamp with time zone' })
  receivedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
