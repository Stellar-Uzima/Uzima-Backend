import { ApiProperty } from '@nestjs/swagger';

export class HealthProfileCompletionDto {
  @ApiProperty({ description: 'Profile completion percentage (0-100)', example: 75 })
  score: number;

  @ApiProperty({
    description: 'Optional profile fields that are not yet filled',
    example: ['chronicConditions', 'healthGoals'],
    isArray: true,
  })
  missingFields: string[];
}
