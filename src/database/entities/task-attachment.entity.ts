import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { HealthTask } from '../../tasks/entities/health-task.entity';

@Entity('task_attachments')
export class TaskAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fileName: string;

  @Column()
  fileUrl: string;

  @Column()
  fileType: string;

  @Column({ type: 'int' })
  fileSize: number;

  @Column()
  taskId: string;

  @ManyToOne(() => HealthTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: HealthTask;

  @Column({ nullable: true })
  uploadedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
