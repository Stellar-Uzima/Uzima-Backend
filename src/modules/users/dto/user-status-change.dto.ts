import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../auth/enums/user-status.enum';

export class UserStatusChangeDto {
  @ApiProperty({
    description: 'New user status',
    enum: UserStatus,
    example: UserStatus.INACTIVE,
  })
  @IsEnum(UserStatus, {
    message: 'Status must be one of: active, inactive, suspended',
  })
  status: UserStatus;

  @ApiPropertyOptional({
    description: 'Reason for status change',
    example: 'User requested account deactivation',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'Reason must be less than 500 characters',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional notes or context',
    example: 'User will be reactivated after verification process',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Notes must be less than 1000 characters',
  })
  notes?: string;
}

export class UserStatusResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'Previous status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  previousStatus: UserStatus;

  @ApiProperty({
    description: 'New status',
    enum: UserStatus,
    example: UserStatus.INACTIVE,
  })
  newStatus: UserStatus;

  @ApiProperty({
    description: 'Status change timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  changedAt: Date;

  @ApiProperty({
    description: 'ID of the user who made the change',
    example: '456e7890-e89b-12d3-a456-426614174111',
  })
  changedBy: string;

  @ApiProperty({
    description: 'Role of the user who made the change',
    enum: ['USER', 'HEALER', 'ADMIN'],
    example: 'ADMIN',
  })
  changedByRole: string;

  @ApiPropertyOptional({
    description: 'Reason for status change',
    example: 'User requested account deactivation',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'User will be reactivated after verification',
  })
  notes?: string;
}
