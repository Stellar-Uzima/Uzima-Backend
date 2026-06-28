import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('failed_reward_jobs')
export class FailedRewardJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  xlmAmount: number;

  @Column({ type: 'uuid', nullable: true })
  taskCompletionId?: string;

  @Column({ type: 'text' })
  errorMessage: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  jobId?: string;

  @Column({ type: 'int', default: 0 })
  attemptsMade: number;

  @Column({ type: 'varchar', length: 50, default: 'reward-distribution' })
  jobType: string;

  @Column({ type: 'jsonb', nullable: true })
  jobData?: Record<string, unknown>;

  @CreateDateColumn()
  failedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
