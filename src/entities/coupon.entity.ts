import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum CouponStatus {
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum CouponType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  FREE_TRIAL = 'free_trial',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({
    type: 'enum',
    enum: CouponType,
    default: CouponType.PERCENTAGE,
  })
  type: CouponType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  value: number;

  @Column({ type: 'enum', enum: CouponStatus, default: CouponStatus.ACTIVE })
  status: CouponStatus;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  usedAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  maxUses: number;

  @Column({ default: 0 })
  usedCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}