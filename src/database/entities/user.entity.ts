import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { IsEmail, IsString, IsEnum, IsBoolean, Length, Matches, IsOptional } from 'class-validator';
import { Role } from '../../auth/enums/role.enum';
import { Session } from './session.entity';
import { Organization } from './organization.entity';
import { UserActivity } from './user-activity.entity';
import { UserPreferences } from './user-preferences.entity';

export enum UserRole {
  USER = 'USER',
  HEALER = 'HEALER',
  ADMIN = 'ADMIN',
}

@Entity('users')
@Index(['email'])
@Index(['phone'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @IsEmail()
  email: string;

  @Column({ type: 'varchar', length: 100 })
  @IsString()
  @Length(1, 100)
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  @IsString()
  @Length(1, 100)
  lastName: string;

  @Column({ type: 'varchar', length: 255, select: false })
  @IsString()
  @Length(8, 255)
  password: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone number must be a valid international format' })
  phone?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsString()
  @IsOptional()
  avatar?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsString()
  @IsOptional()
  address?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsString()
  @IsOptional()
  city?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsString()
  @IsOptional()
  country?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  @IsEnum(UserRole)
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  emailVerified: boolean;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  twoFactorEnabled: boolean;

  @Column({ type: 'varchar', nullable: true, select: false })
  @IsOptional()
  @IsString()
  twoFactorSecret?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  fcmToken?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  @IsOptional()
  @IsString()
  passwordResetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiry?: Date | null;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockedUntil?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  walletAddress?: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  walletBalance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  dailyXlmEarned: number;

  @Column({ type: 'varchar', nullable: true })
  address?: string;

  @Column({ type: 'varchar', nullable: true })
  city?: string;

  @Column({ type: 'varchar', nullable: true })
  postalCode?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar?: string;

  @Column({ nullable: true })
  referralCode?: string;

  @Column({ type: 'boolean', default: true })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  lastLoginAt?: Date | null;

  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  // Relationships
  @OneToMany(() => UserActivity, (activity) => activity.user)
  activities: UserActivity[];

  @OneToMany(() => Session, (session) => session.user)
  sessions?: Session[];

  @ManyToMany(() => Organization, (organization) => organization.users)
  @JoinTable({
    name: 'user_organizations',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'organizationId', referencedColumnName: 'id' },
  })
  organizations?: Organization[];

  @OneToMany(() => UserPreferences, (preferences) => preferences.user)
  preferences: UserPreferences[];
}
