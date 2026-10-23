import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OutboxEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export enum EmailDeliveryStatus {
  ACCEPTED = 'accepted',
  DELIVERED = 'delivered',
  BOUNCED = 'bounced',
  DEFERRED = 'deferred',
  COMPLAINED = 'complained',
  FAILED = 'failed',
}

@Entity('outbox_events')
@Index(['status', 'availableAt'])
@Index(['aggregateType', 'aggregateId'])
export class OutboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  eventType: string;

  @Column({ type: 'varchar', length: 128 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 255 })
  aggregateId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  availableAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('email_delivery_events')
@Index(['providerEventId'], { unique: true })
@Index(['notificationId', 'occurredAt'])
export class EmailDeliveryEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ type: 'varchar', length: 255 })
  providerEventId: string;

  @Column({ type: 'varchar', length: 255 })
  providerMessageId: string;

  @Column({ type: 'uuid', nullable: true })
  notificationId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipient: string | null;

  @Column({ type: 'varchar', length: 32 })
  status: EmailDeliveryStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  rawPayload: Record<string, unknown>;

  @Column({ type: 'timestamp' })
  occurredAt: Date;

  @CreateDateColumn()
  receivedAt: Date;
}
