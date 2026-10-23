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
