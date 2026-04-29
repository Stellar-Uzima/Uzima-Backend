import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IsString, IsUUID, IsOptional, IsBoolean, Length, Matches } from 'class-validator';
import { User } from './user.entity';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 255 })
  @IsString()
  @Length(32, 255)
  tokenId: string;

  @ManyToOne(() => User, (user) => user.sessions, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  device?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, { message: 'Invalid IP address format' })
  ip?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  userAgent?: string;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  lastActiveAt: Date;
}
