import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsDate, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { User } from '../../entities/user.entity';

export enum TaskExportRequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Entity('task_export_requests')
@Index(['userId', 'requestedAt'])
@Index(['status'])
@Index(['downloadExpiresAt'])
export class TaskExportRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @IsUUID()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: TaskExportRequestStatus,
    default: TaskExportRequestStatus.PENDING,
  })
  @IsEnum(TaskExportRequestStatus)
  status: TaskExportRequestStatus;

  @Column({ type: 'timestamp' })
  @IsDate()
  requestedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDate()
  completedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDate()
  downloadExpiresAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
