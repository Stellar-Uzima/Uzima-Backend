import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RewardType {
  XLM = 'XLM',
  CREDITS = 'CREDITS',
  COUPON = 'COUPON',
  BADGE = 'BADGE',
}

export enum RewardCatalogStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  /** Legacy soft-delete state; new soft deletes use ARCHIVED. */
  DISCONTINUED = 'DISCONTINUED',
  ARCHIVED = 'ARCHIVED',
  EXPIRED = 'EXPIRED',
}

/**
 * Admin-managed reward catalog.
 * Defines available rewards, their costs, and stock levels.
 */
@Entity('reward_catalog')
@Index(['type'])
@Index(['status'])
export class RewardCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: RewardType,
    default: RewardType.XLM,
  })
  type: RewardType;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  cost: number; // Cost in XLM (or credits for CREDITS type)

  @Column({ type: 'int', default: 0 })
  stock: number; // -1 for unlimited

  @Column({ type: 'int', default: 0 })
  redeemedCount: number; // Track total redemptions

  @Column({
    type: 'enum',
    enum: RewardCatalogStatus,
    default: RewardCatalogStatus.ACTIVE,
  })
  status: RewardCatalogStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null; // Flexible metadata (e.g., coupon template, badge image URL)

  /**
   * Absolute expiry instant for time-limited rewards (null = never expires).
   * Stored as `timestamptz` and compared against UTC (`NOW()`), so expiry
   * rules are time-zone independent: the stored instant is authoritative and
   * no client/server local time-zone interpretation applies.
   */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  updatedAt: Date;
}