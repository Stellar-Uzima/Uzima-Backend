import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class NotificationPreferencesResponseDto {
  @Expose()
  @ApiProperty({ description: 'Enable or disable task reminder notifications' })
  taskReminders: boolean;

  @Expose()
  @ApiProperty({ description: 'Enable or disable reward alert notifications' })
  rewardAlerts: boolean;

  @Expose()
  @ApiProperty({ description: 'Enable or disable streak alert notifications' })
  streakAlerts: boolean;

  @Expose()
  @ApiProperty({ description: 'Quiet hours start time (HH:mm format)', nullable: true })
  quietHoursStart: string | null;

  @Expose()
  @ApiProperty({ description: 'Quiet hours end time (HH:mm format)', nullable: true })
  quietHoursEnd: string | null;

  @Expose()
  @ApiProperty({ description: 'User timezone (IANA timezone string)' })
  timezone: string;
}

@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({ description: 'User unique identifier', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'User email address', example: 'user@example.com', nullable: true })
  email: string;

  @Expose()
  @ApiProperty({ description: 'User phone number', example: '+2348012345678', nullable: true })
  phoneNumber: string;

  @Expose()
  @ApiProperty({ description: 'User first name', example: 'John' })
  firstName: string;

  @Expose()
  @ApiProperty({ description: 'User last name', example: 'Doe' })
  lastName: string;

  @Expose()
  @ApiProperty({ description: 'Whether the user account is active', example: true })
  isActive: boolean;

  @Expose()
  @ApiProperty({ description: 'Account creation timestamp', example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-20T14:45:00.000Z' })
  updatedAt: Date;

  @Expose()
  @Type(() => NotificationPreferencesResponseDto)
  @ApiProperty({ description: 'Notification preferences', type: NotificationPreferencesResponseDto })
  notificationPreferences?: NotificationPreferencesResponseDto;
}
