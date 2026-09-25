import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * The metric that triggered the degradation event.
 */
export enum DegradationMetric {
  LATENCY_P95 = 'latency_p95',
  ERROR_RATE = 'error_rate',
  CONSECUTIVE_5XX = 'consecutive_5xx',
}

/**
 * Lifecycle of a degradation event: active until metrics recover, then
 * resolved and retained for post-mortems.
 */
export enum DegradationStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
}

/**
 * A persisted UX-degradation episode for one route. Created when a route's
 * latency or error rate crosses its threshold and resolved once the metrics
 * recover — so support can see exactly when the experience degraded and for
 * how long.
 */
@Entity('ux_degradation_events')
@Index(['status'])
@Index(['route', 'metric'])
export class UxDegradationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  method: string;

  @Column({ type: 'varchar', length: 255 })
  route: string;

  @Column({ type: 'enum', enum: DegradationMetric })
  metric: DegradationMetric;

  @Column({ type: 'float' })
  threshold: number;

  @Column({ type: 'float' })
  observedValue: number;

  @Column({ type: 'int', default: 0 })
  sampleCount: number;

  @Column({ type: 'enum', enum: DegradationStatus, default: DegradationStatus.ACTIVE })
  status: DegradationStatus;

  @Column({ type: 'timestamp' })
  detectedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}