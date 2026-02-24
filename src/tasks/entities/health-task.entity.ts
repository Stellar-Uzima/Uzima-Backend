import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskCategory } from './task-category.entity';
import { User } from '../../entities/user.entity';
import { ProofType } from '../enums/proof-type.enum';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskDifficulty } from '../enums/task-difficulty.enum';

@Entity('health_tasks')
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'json', nullable: true })
  titleTranslations: object;

  @Column('text')
  description: string;

  @Column({ type: 'json', nullable: true })
  descriptionTranslations: object;

  @ManyToOne(() => TaskCategory)
  category: TaskCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  xlmReward: number;

  @Column({ type: 'enum', enum: ProofType })
  proofType: ProofType;

  @Column({ type: 'enum', enum: TaskDifficulty })
  difficulty: TaskDifficulty;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.DRAFT })
  status: TaskStatus;

  @ManyToOne(() => User)
  author: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
