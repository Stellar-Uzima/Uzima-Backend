import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export enum ProofType {
  PHOTO = 'photo',
  TEXT = 'text',
  NONE = 'none',
  SELF_REPORT = 'self_report',
}

export class CompleteTaskDto {
  @ApiProperty({ description: 'ID of the task to complete', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsString()
  taskId: string;

  @ApiProperty({ description: 'Type of proof submitted for task completion', enum: ProofType, example: ProofType.PHOTO })
  @IsEnum(ProofType)
  proofType: ProofType;

  @ApiPropertyOptional({ description: 'URL of the proof submission (e.g., photo or text proof)', example: 'https://example.com/proof.jpg' })
  @IsOptional()
  @IsUrl()
  proofUrl?: string;
}
