import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { InAppNotification, DeliveryChannel } from './in-app-notification.entity';

export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('notification_delivery_logs')
@Index(['notificationId', 'channel'])
@Index(['status', 'attemptedAt'])
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  notificationId: string;

  @ManyToOne(() => InAppNotification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notificationId' })
  notification: InAppNotification;

  @Column({
    type: 'enum',
    enum: DeliveryChannel,
  })
  channel: DeliveryChannel;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  /**
   * How many times delivery has been attempted (including initial attempt).
   */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  attemptedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
