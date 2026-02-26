import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums/role.enum';
import type { ReferralRecord } from '../../referral/entities/referral-record.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  fullName: string;

  @Column({ nullable: true, unique: true })
  phoneNumber: string;

  @Column({ length: 2 })
  country: string;

  @Column({ default: 'en' })
  preferredLanguage: string;

  @Column({ nullable: true })
  stellarWalletAddress: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true, unique: true })
  emailVerificationToken: string;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpiry: Date;

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiry: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true, unique: true })
  referralCode?: string;

  @ManyToOne(() => User, { nullable: true })
  referredBy?: User;

  @OneToMany(
    () => require('../../referral/entities/referral-record.entity').ReferralRecord,
    'referrer',
  )
  referralRecords?: ReferralRecord[];
}
