import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ConsentSource, ConsentType } from '../entities/user-consent-record.entity';

/**
 * Payload for capturing or updating a single consent category.
 */
export class RecordConsentDto {
  @IsUUID()
  userId: string;

  @IsEnum(ConsentType)
  consentType: ConsentType;

  /** `true` captures a grant; `false` records a refusal/withdrawal. */
  granted: boolean;

  @IsEnum(ConsentSource)
  @IsOptional()
  source?: ConsentSource;

  @IsString()
  @Length(1, 20)
  @IsOptional()
  version?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}