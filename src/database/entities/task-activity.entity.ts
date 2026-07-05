import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { HealthTask } from '../../tasks/entities/health-task.entity';

@Entity('task_activities')
export class TaskActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @ManyToOne(() => HealthTask)
  @JoinColumn({ name: 'taskId' })
  task: HealthTask;

  @Column()
  userId: string;

  @Column()
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}