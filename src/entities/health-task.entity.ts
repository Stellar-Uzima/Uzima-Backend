import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from './user.entity';
import { TaskCategory } from '../database/entities/task-category.entity';
import { TaskTag } from '../database/entities/task-tag.entity';

@Entity('health_tasks')
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.healthTasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  rewardAmount: number;

  @Column({ type: 'uuid', nullable: true })
  categoryId?: string;

  @ManyToOne(() => TaskCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: TaskCategory;

  @ManyToMany(() => TaskTag, (tag) => tag.healthTasks, { cascade: true })
  @JoinTable({
    name: 'health_task_tags',
    joinColumn: { name: 'healthTaskId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags?: TaskTag[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
