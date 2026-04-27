import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IsString, IsUUID, IsOptional, IsDateString, Length } from 'class-validator';
import { User } from './user.entity';

@Entity('email_verifications')
export class EmailVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 255 })
  @IsString()
  @Length(32, 255)
  token: string;

  @Column({ type: 'timestamp' })
  @IsDateString()
  expiresAt!: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  consumedAt?: Date | null;
}
