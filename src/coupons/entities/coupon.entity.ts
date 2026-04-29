import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { User } from '../../entities/user.entity';

export enum CouponStatus {
  ACTIVE = 'active',
  REDEEMED = 'redeemed',
  EXPIRED = 'expired',
}

const UPPERCASE_ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 8;

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 8 })
  code: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  discount: number; // percentage

  @Column({ nullable: true })
  specialistType: string;

  @Column()
  expiresAt: Date;

  @Column({ type: 'enum', enum: CouponStatus, default: CouponStatus.ACTIVE })
  status: CouponStatus;

  @CreateDateColumn()
  createdAt: Date;

  @BeforeInsert()
  generateCode(): void {
    if (this.code?.length === CODE_LENGTH) return;
    let result = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      result += UPPERCASE_ALPHANUMERIC.charAt(
        Math.floor(Math.random() * UPPERCASE_ALPHANUMERIC.length),
      );
    }
    this.code = result;
  }
}
