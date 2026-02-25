import { IsEnum, IsInt, IsOptional, IsUrl, IsPositive } from 'class-validator';

export enum ProofType {
  PHOTO = 'photo',
  TEXT = 'text',
  NONE = 'none',
}

export class CompleteTaskDto {
  @IsInt()
  @IsPositive()
  taskId: number;

  @IsEnum(ProofType)
  proofType: ProofType;

  @IsOptional()
  @IsUrl()
  proofUrl?: string;
}
