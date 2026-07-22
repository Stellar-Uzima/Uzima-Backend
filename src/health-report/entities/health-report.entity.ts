import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../entities/user.entity';

export enum HealthReportStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('health_reports')
@Index(['user', 'periodStart', 'periodEnd'])
export class HealthReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'date' })
  periodStart: string;

  @Column({ type: 'date' })
  periodEnd: string;

  @Column({
    type: 'enum',
    enum: HealthReportStatus,
    default: HealthReportStatus.PENDING,
  })
  status: HealthReportStatus;

  @Column({ type: 'varchar', nullable: true })
  storageKey: string | null;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
