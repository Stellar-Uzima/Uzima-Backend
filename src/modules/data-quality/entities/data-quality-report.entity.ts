import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Severity of a data-quality anomaly. Higher severities are also surfaced
 * through operational logs (`logger.error`) so they can collide with
 * existing alerting.
 */
export enum DataQualitySeverity {
  INFO = 'info',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Outcome of a single validation job run.
 */
export enum DataQualityStatus {
  PASSED = 'passed',
  WITH_ANOMALIES = 'with_anomalies',
  FAILED = 'failed',
}

/**
 * A persisted record of one validation job run. Jobs run on a schedule (see
 * `DataQualityScheduler`) and every run writes a report so support staff can
 * retrieve historical data-quality snapshots and act on the actionable
 * anomaly details stored in `anomalies`.
 */
@Entity('data_quality_reports')
@Index(['jobName', 'windowEnd'])
@Index(['severity', 'status'])
export class DataQualityReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  jobName: string;

  @Column({ type: 'varchar', length: 100 })
  tableName: string;

  @Column({
    type: 'enum',
    enum: DataQualitySeverity,
    default: DataQualitySeverity.INFO,
  })
  severity: DataQualitySeverity;

  @Column({
    type: 'enum',
    enum: DataQualityStatus,
    default: DataQualityStatus.PASSED,
  })
  status: DataQualityStatus;

  @Column({ type: 'int', default: 0 })
  checkedCount: number;

  @Column({ type: 'int', default: 0 })
  anomalyCount: number;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  anomalies: Array<Record<string, unknown>> | null;

  @Column({ type: 'timestamp' })
  windowStart: Date;

  @Column({ type: 'timestamp' })
  windowEnd: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}