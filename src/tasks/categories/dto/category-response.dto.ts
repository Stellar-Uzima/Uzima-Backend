import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NameTranslations } from '../../entities/task-category.entity';

export class CategoryResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Fitness' })
  name: string;

  @ApiPropertyOptional({
    description: 'Localised name keyed by ISO 639-1 language code',
  })
  nameTranslations?: NameTranslations;

  @ApiPropertyOptional({ example: 'dumbbell' })
  icon?: string;

  @ApiPropertyOptional({ example: '#4ade80' })
  color?: string;
}
