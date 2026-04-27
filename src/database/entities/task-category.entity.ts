import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { IsString, IsEnum, IsUUID, IsOptional, Length, IsBoolean } from 'class-validator';
import { User } from './user.entity';

export enum PredefinedCategory {
  NUTRITION = 'nutrition',
  EXERCISE = 'exercise',
  MEDICATION = 'medication',
  SLEEP = 'sleep',
  MENTAL_HEALTH = 'mental-health',
}

@Entity('task_categories')
@Index(['userId'])
@Index(['isPredefined'])
export class TaskCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @IsString()
  @Length(1, 100)
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  icon?: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color code' })
  color?: string;

  @Column({
    type: 'enum',
    enum: PredefinedCategory,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(PredefinedCategory)
  predefinedType?: PredefinedCategory;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  isPredefined: boolean;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  @IsOptional()
  sortOrder: number;

  @Column({ name: 'user_id', nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

  // Static method to get predefined categories
  static getPredefinedCategories(): Omit<TaskCategory, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'user'>[] {
    return [
      {
        name: 'Nutrition',
        description: 'Track meals, calories, and dietary habits',
        icon: '🥗',
        color: '#4CAF50',
        predefinedType: PredefinedCategory.NUTRITION,
        isPredefined: true,
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'Exercise',
        description: 'Monitor physical activities and workouts',
        icon: '🏃',
        color: '#FF9800',
        predefinedType: PredefinedCategory.EXERCISE,
        isPredefined: true,
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Medication',
        description: 'Manage medication schedules and adherence',
        icon: '💊',
        color: '#2196F3',
        predefinedType: PredefinedCategory.MEDICATION,
        isPredefined: true,
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Sleep',
        description: 'Track sleep patterns and quality',
        icon: '😴',
        color: '#9C27B0',
        predefinedType: PredefinedCategory.SLEEP,
        isPredefined: true,
        isActive: true,
        sortOrder: 4,
      },
      {
        name: 'Mental Health',
        description: 'Monitor mood, stress, and mental wellness',
        icon: '🧠',
        color: '#E91E63',
        predefinedType: PredefinedCategory.MENTAL_HEALTH,
        isPredefined: true,
        isActive: true,
        sortOrder: 5,
      },
    ];
  }
}

// Import Matches decorator
import { Matches } from 'class-validator';
