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
import { IsUUID, IsString, IsBoolean, IsNumber, IsOptional, Min, Max, IsDateString, Length } from 'class-validator';
import { User } from '../../entities/user.entity';
import { HealthTask } from '../../tasks/entities/health-task.entity';

@Entity('task_completions')
@Index(['userId', 'taskId'])
@Index(['userId', 'completedAt'])
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @IsUUID()
  userId: string;

  @Column({ type: 'uuid' })
  @IsUUID()
  taskId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => HealthTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: HealthTask;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  isCompleted: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  completionPercentage: number; // 0-100

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}