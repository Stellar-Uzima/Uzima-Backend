import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('task_activity')
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
}
