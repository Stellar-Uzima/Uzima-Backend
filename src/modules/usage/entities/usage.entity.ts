import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../../users/entities/user.entity';

@Entity('usages')
export class Usage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  event: string; // e.g., 'api_call', 'task_completion'

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number; // for metering, like cost or count

  @Column({ nullable: true })
  metadata: string; // JSON string for additional data

  @CreateDateColumn()
  createdAt: Date;
}