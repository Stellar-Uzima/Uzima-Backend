import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Unique,
} from 'typeorm';
import { Role } from '../auth/enums/role.enum';
import { UserStatus } from '../auth/enums/user-status.enum';
import { HealthTask } from './health-task.entity';
import { Session } from '../database/entities/session.entity';
import { Organization } from '../database/entities/organization.entity';

@Entity('users')
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 2 })
  country: string;

  @Column({ default: 'en' })
  preferredLanguage: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 201, nullable: true })
  fullName?: string;

  @Column({ type: 'varchar', length: 255, select: false, nullable: true })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  // Keep isActive for backward compatibility during migration
  @Column({ type: 'boolean', default: true, select: false })
  isActive: boolean;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'varchar', nullable: true, unique: true })
  emailVerificationToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpiry: Date | null;

  @Column({ type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiry: Date | null;

  @Column({ type: 'varchar', nullable: true })
  walletAddress: string | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  stellarWalletAddress: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  dailyXlmEarned: number;

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ nullable: true, unique: true })
  referralCode?: string | null;

  @ManyToOne(() => User, { nullable: true })
  referredBy?: User;

  @OneToMany(() => HealthTask, (healthTask) => healthTask.user)
  healthTasks?: HealthTask[];

  @OneToMany(() => Session, (session) => session.user)
  sessions?: Session[];

  @ManyToMany(() => Organization, (organization) => organization.users)
  @JoinTable({
    name: 'user_organizations',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'organizationId', referencedColumnName: 'id' },
  })
  organizations?: Organization[];

  @OneToMany('ReferralRecord', 'referrer')
  referralRecords?: any[];
}
