import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  ManyToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { IsString, IsOptional, Length, IsUUID, IsBoolean } from 'class-validator';
import { User } from './user.entity';

@Entity('task_tags')
@Index(['userId'])
export class TaskTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  @IsString()
  @Length(1, 50)
  name: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  @IsOptional()
  @IsString()
  color?: string;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  isActive: boolean;

  @Column({ name: 'user_id', nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToMany('HealthTask', 'tags')
  healthTasks?: any[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
