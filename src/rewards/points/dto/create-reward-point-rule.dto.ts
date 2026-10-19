import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRewardPointRuleDto {
  @ApiProperty({
    description: 'Unique action key the rule applies to',
    example: 'task.completed',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  action: string;

  @ApiProperty({
    description: 'Points awarded for one occurrence of the action',
    example: 10,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  points: number;

  @ApiPropertyOptional({
    description: 'Whether the rule is currently awardable',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Human-readable description of the rule',
    example: 'Awarded once per completed health task event',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
