import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { IsString, IsEnum, IsUUID, IsOptional, IsObject, IsDateString, Length, Matches } from 'class-validator';
import { User } from './user.entity';

export enum ActivityType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  API_CALL = 'API_CALL',
  PROFILE_UPDATE = 'PROFILE_UPDATE',
  TASK_CREATED = 'TASK_CREATED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  AVATAR_UPDATED = 'AVATAR_UPDATED',
}

@Entity('user_activities')
@Index(['userId', 'createdAt'])
export class UserActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @IsUUID()
  userId: string;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  activityType: ActivityType;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description: string;

  @Column({ type: 'json', nullable: true })
  @IsOptional()
  @IsObject()
  metadata: Record<string, any>;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, { message: 'Invalid IP address format' })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  userAgent: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { lazy: true })
  user: Promise<User>;
}
