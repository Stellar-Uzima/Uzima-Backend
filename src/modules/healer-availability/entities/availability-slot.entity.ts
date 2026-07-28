import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../../entities/user.entity';

export enum DayOfWeek {
  MONDAY = 0,
  TUESDAY = 1,
  WEDNESDAY = 2,
  THURSDAY = 3,
  FRIDAY = 4,
  SATURDAY = 5,
  SUNDAY = 6,
}

@Entity('availability_slots')
@Index(['healerId', 'dayOfWeek'])
@Index(['healerId', 'isRecurring'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  healerId!: string;

  @Column({ type: 'int' })
  dayOfWeek!: DayOfWeek;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  @Column({ default: true })
  isRecurring!: boolean;

  @Column({ type: 'date', nullable: true })
  exceptionDate!: Date | null;

  @Column({ default: false })
  isBlocked!: boolean;

  @Column({ type: 'text', nullable: true })
  blockReason!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'healerId' })
  healer!: User;

  @CreateDateColumn()
  createdAt!: Date;
}