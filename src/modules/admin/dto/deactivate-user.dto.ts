import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { Role } from '@modules/auth/enums/role.enum';

/** Why an account is being closed. Stored for audit and for later appeals. */
export enum DeactivationReasonCode {
  USER_REQUEST = 'USER_REQUEST',
  ADMIN_POLICY = 'ADMIN_POLICY',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  DUPLICATE_ACCOUNT = 'DUPLICATE_ACCOUNT',
  ABANDONED = 'ABANDONED',
  OTHER = 'OTHER',
}

export class DeactivateUserDto {
  @ApiProperty({
    description: 'Machine-readable reason. Stored on the status log for audit.',
    enum: DeactivationReasonCode,
  })
  @IsEnum(DeactivationReasonCode, {
    message: `reasonCode must be one of: ${Object.values(DeactivationReasonCode).join(', ')}`,
  })
  reasonCode: DeactivationReasonCode;

  @ApiPropertyOptional({
    description: 'Human explanation. Required when reasonCode is OTHER.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'Extra context for the audit trail', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({
    description:
      'Must be true to proceed. Guards against an admin deactivating a live account by accident from a mis-click.',
    default: false,
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirm: boolean = false;
}

export class ReactivateUserDto {
  @ApiPropertyOptional({ description: 'Why the account is being restored', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    description: 'Must be true to proceed.',
    default: false,
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirm: boolean = false;
}

export class DeactivationHistoryQueryDto {
  @ApiPropertyOptional({ description: 'How many entries to return', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @MinLength(1)
  limit: number = 20;
}

export class DeactivationResultDto {
  @ApiProperty({ description: 'Affected user id' })
  userId: string;

  @ApiProperty({ description: 'Status before the change', enum: UserStatus })
  previousStatus: UserStatus;

  @ApiProperty({ description: 'Status after the change', enum: UserStatus })
  newStatus: UserStatus;

  @ApiProperty({ description: 'True when sessions and refresh tokens were revoked', example: true })
  sessionsRevoked: boolean;

  @ApiProperty({ description: 'True when the row was kept for audit; never hard-deleted', example: true })
  dataRetained: boolean;

  @ApiProperty({ description: 'When the change was applied' })
  changedAt: Date;

  @ApiProperty({ description: 'Admin who performed the change' })
  changedBy: string;

  @ApiProperty({ description: 'Role of that admin', enum: Role })
  changedByRole: Role;

  @ApiPropertyOptional({ description: 'Recorded reason code', enum: DeactivationReasonCode })
  reasonCode?: DeactivationReasonCode;

  @ApiPropertyOptional({ description: 'Recorded reason' })
  reason?: string;
}
