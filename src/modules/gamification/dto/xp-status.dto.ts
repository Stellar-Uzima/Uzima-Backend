import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class XpStatusDto {
  @ApiProperty({ description: 'Unique identifier of the user', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ description: 'Total experience points earned', example: 1250 })
  totalXp: number;

  @ApiProperty({ description: 'Current level based on total XP', example: 3 })
  currentLevel: number;

  @ApiProperty({ description: 'XP earned toward the next level', example: 250 })
  xpTowardNextLevel: number;

  @ApiProperty({ description: 'Total XP required to reach the next level', example: 500 })
  xpForNextLevel: number;

  @ApiProperty({ description: 'Progress toward the next level as a percentage (0-100)', example: 50 })
  progressPercentage: number;
}

export class AwardXpDto {
  @ApiProperty({ description: 'ID of the user to award XP to', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ description: 'Amount of XP to award', example: 50 })
  amount: number;

  @ApiProperty({ description: 'Reason for awarding XP', example: 'Completed morning walk task' })
  reason: string;

  @ApiProperty({ description: 'Event that triggered the XP award', example: 'task_completed' })
  sourceEvent: string;

  @ApiPropertyOptional({ description: 'Optional metadata associated with the XP award' })
  metadata?: Record<string, any>;
}

export class XpTransactionDto {
  @ApiProperty({ description: 'Unique identifier of the transaction', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ description: 'ID of the user involved in the transaction', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ description: 'Amount of XP in the transaction', example: 50 })
  amount: number;

  @ApiProperty({ description: 'Reason for the XP transaction', example: 'Completed morning walk task' })
  reason: string;

  @ApiProperty({ description: 'Event that triggered the transaction', example: 'task_completed' })
  sourceEvent: string;

  @ApiPropertyOptional({ description: 'Optional metadata associated with the transaction' })
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'Timestamp when the transaction occurred', example: '2026-01-15T12:00:00.000Z' })
  createdAt: Date;
}

export class LevelUpEventDto {
  @ApiProperty({ description: 'ID of the user who leveled up', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ description: 'The new level the user has reached', example: 4 })
  newLevel: number;

  @ApiProperty({ description: 'XP earned during this level-up event', example: 120 })
  xpEarned: number;

  @ApiProperty({ description: 'Total XP after the level-up', example: 2000 })
  totalXp: number;
}
