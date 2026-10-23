import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum IdempotencyKeyStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('idempotency_keys')
@Index(['userId', 'method', 'path', 'key'], { unique: true })
@Index(['expiresAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  key: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  @Column({ length: 16 })
  method: string;

  @Column({ length: 512 })
  path: string;

  @Column({ length: 128 })
  requestHash: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: IdempotencyKeyStatus.IN_PROGRESS,
  })
  status: IdempotencyKeyStatus;

  @Column({ type: 'integer', default: 200 })
  statusCode: number;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: any;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lockToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lockExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
