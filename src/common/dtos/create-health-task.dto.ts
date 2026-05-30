import { IsString, IsOptional, IsEnum, IsDate, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ description: 'Short title of the health task', example: 'Drink 2L of water' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Health category the task belongs to',
    enum: TaskCategory,
    example: TaskCategory.HYDRATION,
  })
  @IsEnum(TaskCategory)
  @IsNotEmpty()
  category: TaskCategory;

  @ApiProperty({
    description: 'When the task should be completed by (ISO 8601 timestamp)',
    example: '2026-06-01T18:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsDate()
  @IsNotEmpty()
  dueDate: Date;

  @ApiPropertyOptional({
    description: 'Longer free-form description of the task',
    example: 'Sip water steadily through the day; avoid sugary drinks.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Priority level of the task',
    enum: TaskPriority,
    example: TaskPriority.MEDIUM,
  })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'How often the task should repeat',
    enum: TaskFrequency,
    example: TaskFrequency.DAILY,
  })
  @IsEnum(TaskFrequency)
  @IsOptional()
  frequency?: TaskFrequency;
}
