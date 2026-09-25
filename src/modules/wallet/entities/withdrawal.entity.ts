import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../entities/user.entity';
import { WithdrawalStatus } from './withdrawal.dto';

@Entity('wallet_withdrawals')
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
export class Withdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ name: 'destination_address', type: 'varchar', length: 56 })
  destinationAddress: string;

  @Column({ name: 'memo', type: 'varchar', length: 255, nullable: true })
  memo: string | null;

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
    name: 'status',
  })
  status: WithdrawalStatus;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 64, nullable: true })
  transactionHash: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone', precision: 6 })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true, precision: 6 })
  completedAt: Date | null;
}