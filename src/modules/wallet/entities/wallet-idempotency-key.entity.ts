import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Scoped idempotency key for wallet operations.
 *
 * The unique (userId, endpoint, idempotencyKey) scope lets a client retry a
 * request safely: the first attempt claims the key inside its transaction and
 * stores the response, later attempts replay that response without repeating
 * side effects, and reusing the key with different input is rejected.
 */
@Entity('wallet_idempotency_keys')
@Index(['userId', 'endpoint', 'idempotencyKey'], { unique: true })
export class WalletIdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  endpoint: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  requestSnapshot: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  responseSnapshot: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;
}
