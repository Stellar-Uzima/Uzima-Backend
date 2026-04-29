import { IsString, IsOptional, IsEnum, IsDate, IsNotEmpty } from 'class-validator';

export enum TaskCategory {
  HYDRATION = 'hydration',
  EXERCISE = 'exercise',
  NUTRITION = 'nutrition',
  MATERNAL_HEALTH = 'maternal_health',
  SLEEP = 'sleep',
  MENTAL_HEALTH = 'mental_health',
  MEDICATION = 'medication',
  OTHER = 'other',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export class CreateHealthTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(TaskCategory)
  @IsNotEmpty()
  category: TaskCategory;

  @IsDate()
  @IsNotEmpty()
  dueDate: Date;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsEnum(TaskFrequency)
  @IsOptional()
  frequency?: TaskFrequency;
}
