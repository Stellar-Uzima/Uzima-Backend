import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@modules/auth/enums/role.enum';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { UserFilterDto } from '@modules/users/dto/user-filter.dto';

/** Actions that can be applied to many users in a single request. */
export enum BulkUserActionType {
  ACTIVATE = 'ACTIVATE',
  DEACTIVATE = 'DEACTIVATE',
  SUSPEND = 'SUSPEND',
  DELETE = 'DELETE',
  CHANGE_ROLE = 'CHANGE_ROLE',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
}

/** Reason codes reported per failed record in a bulk operation. */
export enum BulkUserFailureCode {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_DELETED = 'ALREADY_DELETED',
  INVALID_STATE = 'INVALID_STATE',
  SELF_TARGETED = 'SELF_TARGETED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SAVE_FAILED = 'SAVE_FAILED',
}

/** Payload for the target of a CHANGE_ROLE action. */
export class BulkUserChangeRolePayloadDto {
  @ApiProperty({ description: 'New role to assign to the selected users', enum: Role, example: Role.HEALER })
  @IsEnum(Role)
  role: Role;
}

/**
 * Selector for which users a bulk operation applies to. Exactly one of
 * `userIds` or `filters` must be provided. When `filters` is used, the same
 * shape as the user list endpoint (`UserFilterDto`) is accepted.
 */
export class BulkUserTargetDto {
  @ApiPropertyOptional({
    description: 'Explicit list of user IDs to operate on (max 1000)',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000, { message: 'Cannot target more than 1000 users in a single bulk operation' })
  @IsUUID('4', { each: true, message: 'Each userId must be a valid UUID' })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter-based selection (same shape as the admin user list endpoint)',
    type: UserFilterDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UserFilterDto)
  filters?: UserFilterDto;
}

/** Request body for `POST /admin/users/bulk`. */
export class BulkUserOperationDto {
  @ApiProperty({ description: 'Operation to apply', enum: BulkUserActionType, example: BulkUserActionType.SUSPEND })
  @IsEnum(BulkUserActionType)
  action: BulkUserActionType;

  @ApiProperty({ description: 'Which users to target', type: BulkUserTargetDto })
  @ValidateNested()
  @Type(() => BulkUserTargetDto)
  target: BulkUserTargetDto;

  @ApiPropertyOptional({
    description: 'Required for CHANGE_ROLE actions',
    type: BulkUserChangeRolePayloadDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BulkUserChangeRolePayloadDto)
  payload?: BulkUserChangeRolePayloadDto;

  @ApiPropertyOptional({
    description: 'Audit reason recorded with the operation',
    example: 'Suspended accounts from cleanup campaign #42',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'When true, validate everything and report what would happen without changing any records',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

/** Per-record result for a successful user. */
export interface BulkUserSuccess {
  userId: string;
  status: 'SUCCESS';
  action: BulkUserActionType;
}

/** Per-record result for a failed user, with a machine-readable reason code. */
export interface BulkUserFailure {
  userId: string;
  status: 'FAILED';
  code: BulkUserFailureCode;
  message: string;
}

export type BulkUserRecordResult = BulkUserSuccess | BulkUserFailure;

/** Response for `POST /admin/users/bulk`. */
export class BulkUserOperationResponseDto {
  @ApiProperty({ description: 'Unique identifier for this bulk operation (also used in the audit log)', example: '9f1c3e2a-...' })
  operationId: string;

  @ApiProperty({ description: 'The action that was applied (or would be applied for dry runs)', enum: BulkUserActionType })
  action: BulkUserActionType;

  @ApiProperty({ description: 'Whether this was a dry run' })
  dryRun: boolean;

  @ApiProperty({ description: 'Total number of selected user records' })
  total: number;

  @ApiProperty({ description: 'Number of records that succeeded (or passed validation on a dry run)' })
  succeeded: number;

  @ApiProperty({ description: 'Number of records that failed (or would fail on a dry run)' })
  failed: number;

  @ApiProperty({ description: 'Per-record outcomes', type: [Object] })
  results: BulkUserRecordResult[];

  @ApiProperty({ description: 'Failures only, with reason codes', type: [Object] })
  failures: BulkUserFailure[];
}
