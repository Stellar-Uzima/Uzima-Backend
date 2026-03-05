import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export enum ProofType {
  PHOTO = 'photo',
  TEXT = 'text',
  NONE = 'none',
}

export class CompleteTaskDto {
  @IsString()
  taskId: string;

  @IsEnum(ProofType)
  proofType: ProofType;

  @IsOptional()
  @IsUrl()
  proofUrl?: string;
}
