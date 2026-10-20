import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';

export enum StellarTransactionType {
  PAYMENT = 'payment',
  OUTGOING = 'outgoing',
  INCOMING = 'incoming',
  OTHER = 'other',
}

export enum StellarTransactionStatus {
  SUBMITTED = 'SUBMITTED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * Lifecycle record for a Stellar transaction tracked by the platform.
 *
 * `hash` is the unique network reference; status transitions are idempotent
 * and terminal states (CONFIRMED/FAILED) are never overwritten.
 */
@Entity('stellar_transaction_records')
@Index(['hash'], { unique: true })
@Index(['userId'])
@Index(['status'])
export class StellarTransactionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  hash: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 16 })
  type: StellarTransactionType;

  @Column({ type: 'varchar', length: 16 })
  status: StellarTransactionStatus;

  @Column({ name: 'ledger_sequence', type: 'int', nullable: true })
  ledgerSequence: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 7, nullable: true })
  amount: number | null;

  @Column({ name: 'counterpart_address', type: 'varchar', length: 56, nullable: true })
  counterpartAddress: string | null;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: Record<string, unknown> | null;

  @Column({ name: 'submitted_at', type: 'timestamp with time zone' })
  submittedAt: Date;

  @Column({ name: 'confirmed_at', type: 'timestamp with time zone', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    precision: 6,
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
    precision: 6,
  })
  updatedAt: Date;
}
