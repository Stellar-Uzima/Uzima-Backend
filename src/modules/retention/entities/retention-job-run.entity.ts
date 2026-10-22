import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('retention_job_runs')
export class RetentionJobRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'job_name', type: 'varchar', length: 100 })
  jobName: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'running' | 'succeeded' | 'failed';

  @CreateDateColumn({
    name: 'started_at',
    type: 'timestamp with time zone',
  })
  startedAt: Date;

  @Column({
    name: 'completed_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  completedAt: Date | null;

  @Column({ name: 'deleted_counts', type: 'jsonb', default: () => "'{}'::jsonb" })
  deletedCounts: Record<string, number>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
  })
  updatedAt: Date;
}
