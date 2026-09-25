import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum BackfillRunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('backfill_runs')
@Index(['jobKey'], { unique: true })
export class BackfillRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_key', length: 255 })
  jobKey: string;

  @Column({ type: 'varchar', length: 20, default: BackfillRunStatus.RUNNING })
  status: BackfillRunStatus;

  @Column({ name: 'processed_count', default: 0 })
  processedCount: number;

  @Column({ name: 'failed_count', default: 0 })
  failedCount: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamp with time zone' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;
}
