import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Result of a single notified digest run for one user on one day.
 */
export enum NotificationDigestStatus {
  QUEUED = 'queued',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

/**
 * One digest run per user per day. The `(userId, digestDate)` uniqueness
 * guarantees the digest schedule never emails a user twice for the same day,
 * even if the job is retried or overlaps with a previous run.
 */
@Entity('notification_digest_runs')
@Unique(['userId', 'digestDate'])
export class NotificationDigestRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Local day the digest covers (`YYYY-MM-DD`), used for dedup. */
  @Column({ type: 'date' })
  digestDate: string;

  @Column({
    type: 'enum',
    enum: NotificationDigestStatus,
    default: NotificationDigestStatus.QUEUED,
  })
  status: NotificationDigestStatus;

  /** How many unread notifications were summarised into this digest. */
  @Column({ type: 'int', default: 0 })
  itemsCount: number;

  /** Address the digest email was (logically) dispatched to. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  emailTo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}