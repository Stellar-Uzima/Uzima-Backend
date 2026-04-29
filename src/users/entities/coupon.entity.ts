import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../entities/user.entity';

export enum CouponStatus {
  ACTIVE = 'active',
  REDEEMED = 'redeemed',
  EXPIRED = 'expired',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  code: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  xlmValue: number;

  @Column({ type: 'enum', enum: CouponStatus, default: CouponStatus.ACTIVE })
  status: CouponStatus;

  @Column({ nullable: true })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
