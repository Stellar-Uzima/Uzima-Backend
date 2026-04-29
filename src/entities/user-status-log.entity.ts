import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { UserStatus } from '../auth/enums/user-status.enum';
import { Role } from '../auth/enums/role.enum';

@Entity('user_status_logs')
export class UserStatusLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: UserStatus,
    comment: 'Previous status before change',
  })
  previousStatus: UserStatus;

  @Column({
    type: 'enum',
    enum: UserStatus,
    comment: 'New status after change',
  })
  newStatus: UserStatus;

  @Column({ type: 'uuid' })
  changedBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changedBy' })
  changedByUser: User;

  @Column({
    type: 'enum',
    enum: Role,
    comment: 'Role of the user who made the change',
  })
  changedByRole: Role;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for status change',
  })
  reason?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional notes or context',
  })
  notes?: string;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'IP address of the user who made the change',
  })
  ipAddress?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'User agent string',
  })
  userAgent?: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
