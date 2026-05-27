import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Index } from 'typeorm';

@Entity('task_activity')
@Index(['taskId'])
@Index(['changedBy', 'createdAt'])
@Index(['createdAt'])
export class TaskActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @Column()
  changedBy: string;

  @Column()
  changeType: string;

  @Column({ type: 'jsonb' })
  details: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
