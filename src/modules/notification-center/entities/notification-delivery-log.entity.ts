import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Delivery status of a per-channel notification attempt.
 *
 * - `pending`  - queued for (or being) attempted.
 * - `sent`     - successfully delivered on this channel.
 * - `failed`   - the channel rejected the delivery (retryable).
 * - `escalated` - the delivery exhausted `MAX_DELIVERY_ATTEMPTS` and was
 *   flagged for operational review by the `DeliverySweeperService`.
 */
export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  ESCALATED = 'escalated',
}

@Entity('notification_delivery_logs')
@Index(['notificationId'])
@Index(['status', 'attemptedAt'])
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  notificationId: string;

  @Column({ type: 'varchar', enum: ['in_app', 'email', 'push', 'sms'] })
  channel: string;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  @Column({ type: 'int', default: 0, name: 'attempts' })
  attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  attemptedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Set when the sweeper escalates an exhausted delivery for review.
   */
  @Column({ type: 'timestamp', nullable: true })
  escalatedAt: Date | null;

  /**
   * Human-readable reason recorded when the delivery was escalated.
   */
  @Column({ type: 'text', nullable: true })
  escalatedReason: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}