import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';

export enum StellarAccountLinkStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

export enum StellarNetwork {
  TESTNET = 'testnet',
  PUBLIC = 'public',
}

/**
 * A user's linked Stellar account, proven by an ownership signature.
 *
 * Uniqueness is enforced on the (userId, publicKey) pair so the same
 * identity can never be linked twice; per-user/per-key policy checks live
 * in StellarAccountLinkService.
 */
@Entity('stellar_account_links')
@Index(['userId', 'publicKey'], { unique: true })
export class StellarAccountLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'public_key', type: 'varchar', length: 56 })
  publicKey: string;

  @Column({ type: 'varchar', length: 16 })
  network: StellarNetwork;

  @Column({ type: 'varchar', length: 16 })
  status: StellarAccountLinkStatus;

  @Column({ name: 'verification_tx_hash', type: 'varchar', length: 64, nullable: true })
  verificationTxHash: string | null;

  @Column({ name: 'verified_at', type: 'timestamp with time zone', nullable: true })
  verifiedAt: Date | null;

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
