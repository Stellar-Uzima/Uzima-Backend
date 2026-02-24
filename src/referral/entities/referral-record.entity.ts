import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('referral_records')
export class ReferralRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.referralRecords)
  @JoinColumn({ name: 'referrer_id' })
  referrer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referred_id' })
  referred: User;

  @Column({ default: false })
  rewardPaid: boolean;

  @Column({ type: 'timestamp', nullable: true })
  rewardPaidAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}