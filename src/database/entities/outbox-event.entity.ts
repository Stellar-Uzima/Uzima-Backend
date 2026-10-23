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
  DEAD_LETTER = 'dead_letter',
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

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @Column({ type: 'integer', default: 5 })
  maxRetries: number;

  @Column({ type: 'integer', default: 1000 })
  backoffBaseMs: number;

  @Column({ type: 'integer', default: 300000 })
  backoffMaxMs: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  retryPolicy: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  jobType: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'text', nullable: true })
  deadLetterError: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  availableAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deadLetteredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
