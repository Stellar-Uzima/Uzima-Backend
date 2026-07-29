import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../../entities/user.entity';
import { AvailabilitySlot } from './availability-slot.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('appointments')
@Index(['slotId'], { unique: true })
@Index(['userId'])
@Index(['healerId'])
@Index(['status'])
@Index(['scheduledAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  slotId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  healerId!: string;

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status!: AppointmentStatus;

  @Column({ type: 'timestamp' })
  scheduledAt!: Date;

  @Column({ type: 'integer', nullable: true })
  durationMinutes!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount!: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency!: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ default: false })
  isLateCancellation!: boolean;

  @Column({ type: 'text', nullable: true })
  cancellationNotes!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any>;

  @ManyToOne(() => AvailabilitySlot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slotId' })
  slot!: AvailabilitySlot;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'healerId' })
  healer!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt!: Date | null;
}