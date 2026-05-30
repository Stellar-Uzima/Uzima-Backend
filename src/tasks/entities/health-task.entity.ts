import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum TaskCategory {
  NUTRITION = 'nutrition',
  FITNESS = 'fitness',
  MENTAL = 'mental',
  SLEEP = 'sleep',
  HYDRATION = 'hydration',
}

@Entity('health_tasks')
@Index(['status'])
@Index(['createdAt'])
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string; // Added ! to satisfy strictPropertyInitialization

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'enum', enum: TaskCategory })
  category!: TaskCategory;

  @Column({ type: 'varchar', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'varchar', default: 'draft' })
  status!: string;

  // Changed to number for the application logic, TypeORM handles the decimal conversion
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  xlmReward!: number;

  @Column({ type: 'jsonb', nullable: true })
  targetProfile!: Record<string, any>; 

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  // This is CRITICAL for the "Soft Delete" requirement in your task description
  @DeleteDateColumn()
  deletedAt!: Date | null;
}