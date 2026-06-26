import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipient: string;

  @Column()
  channel: string;

  @Column()
  subject: string;

  @Column('text')
  message: string;

  @Column({
    type: 'simple-enum',
    enum: NotificationStatus,
  })
  status: NotificationStatus;

  @Column({
    nullable: true,
    type: 'text',
  })
  errorReason?: string;

  @CreateDateColumn()
  createdAt: Date;
}