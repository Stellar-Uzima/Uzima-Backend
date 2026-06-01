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

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockedUntil?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

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

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @ManyToMany(() => Organization, (org) => org.users)
  @JoinTable({ name: 'user_organizations' })
  organizations: Organization[];
}

// Import related entities to avoid circular dependencies
import { UserActivity } from './user-activity.entity';
import { UserPreferences } from './user-preferences.entity';
import { Session } from './session.entity';
import { Organization } from './organization.entity';
