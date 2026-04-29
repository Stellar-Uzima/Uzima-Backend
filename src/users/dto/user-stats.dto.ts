import { ApiProperty } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({
    description: 'Number of tasks completed by the user',
    example: 42,
  })
  tasksCompleted: number;

  @ApiProperty({
    description: 'Total XLM earned from completing tasks',
    example: 25.5,
  })
  totalXlmEarned: number;

  @ApiProperty({
    description: 'Current streak of consecutive days with completed tasks',
    example: 7,
  })
  currentStreak: number;

  @ApiProperty({
    description: 'Longest streak of consecutive days with completed tasks',
    example: 14,
  })
  longestStreak: number;

  @ApiProperty({
    description: 'Number of active coupons for the user',
    example: 3,
  })
  activeCoupons: number;

  @ApiProperty({
    description: 'User rank based on total XLM earned',
    example: 5,
  })
  rank: number;
}
