import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsBoolean, IsObject, IsNumber, Matches, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { Theme, NotificationType } from '../../database/entities/user-preferences.entity';

export class NotificationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Enable email notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Task completion notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  tasks?: boolean;

  @ApiPropertyOptional({
    description: 'Reward notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  rewards?: boolean;

  @ApiPropertyOptional({
    description: 'Streak notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  streaks?: boolean;

  @ApiPropertyOptional({
    description: 'Referral notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  referrals?: boolean;

  @ApiPropertyOptional({
    description: 'System notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  system?: boolean;
}

export class PrivacyPreferencesDto {
  @ApiPropertyOptional({
    description: 'Profile visibility',
    enum: ['public', 'private', 'friends'],
    example: 'private',
  })
  @IsOptional()
  @IsEnum(['public', 'private', 'friends'])
  profileVisibility?: 'public' | 'private' | 'friends';

  @ApiPropertyOptional({
    description: 'Show user stats publicly',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  showStats?: boolean;

  @ApiPropertyOptional({
    description: 'Show user streak publicly',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  showStreak?: boolean;

  @ApiPropertyOptional({
    description: 'Show user rank publicly',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  showRank?: boolean;
}

export class AccessibilityPreferencesDto {
  @ApiPropertyOptional({
    description: 'Font size',
    enum: ['small', 'medium', 'large', 'extra-large'],
    example: 'medium',
  })
  @IsOptional()
  @IsEnum(['small', 'medium', 'large', 'extra-large'])
  fontSize?: 'small' | 'medium' | 'large' | 'extra-large';

  @ApiPropertyOptional({
    description: 'High contrast mode',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  highContrast?: boolean;

  @ApiPropertyOptional({
    description: 'Reduced motion',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;

  @ApiPropertyOptional({
    description: 'Screen reader support',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  screenReader?: boolean;
}

export class AppPreferencesDto {
  @ApiPropertyOptional({
    description: 'Auto-start daily tasks',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  autoStartTasks?: boolean;

  @ApiPropertyOptional({
    description: 'Daily reminder time (HH:mm format)',
    example: '09:00',
    pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Daily reminder time must be in HH:mm format (e.g., 09:00)',
  })
  dailyReminderTime?: string;

  @ApiPropertyOptional({
    description: 'Weekly report day (0-6, Sunday-Saturday)',
    example: 1,
    minimum: 0,
    maximum: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(6)
  weeklyReportDay?: number;

  @ApiPropertyOptional({
    description: 'User timezone',
    example: 'UTC',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    description: 'Theme preference',
    enum: Theme,
    example: Theme.SYSTEM,
  })
  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;

  @ApiPropertyOptional({
    description: 'Language preference',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Email notification preferences',
    type: NotificationPreferencesDto,
  })
  @IsOptional()
  @IsObject()
  emailNotifications?: NotificationPreferencesDto;

  @ApiPropertyOptional({
    description: 'Push notification preferences',
    type: NotificationPreferencesDto,
  })
  @IsOptional()
  @IsObject()
  pushNotifications?: NotificationPreferencesDto;

  @ApiPropertyOptional({
    description: 'SMS notification preferences',
    type: NotificationPreferencesDto,
  })
  @IsOptional()
  @IsObject()
  smsNotifications?: NotificationPreferencesDto;

  @ApiPropertyOptional({
    description: 'Privacy preferences',
    type: PrivacyPreferencesDto,
  })
  @IsOptional()
  @IsObject()
  privacy?: PrivacyPreferencesDto;

  @ApiPropertyOptional({
    description: 'Accessibility preferences',
    type: AccessibilityPreferencesDto,
  })
  @IsOptional()
  @IsObject()
  accessibility?: AccessibilityPreferencesDto;

  @ApiPropertyOptional({
    description: 'App preferences',
    type: AppPreferencesDto,
  })
  @IsOptional()
  @IsObject()
  app?: AppPreferencesDto;
}

export class PreferencesResponseDto {
  @ApiProperty({
    description: 'User preferences ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Theme preference',
    enum: Theme,
    example: Theme.SYSTEM,
  })
  theme: Theme;

  @ApiProperty({
    description: 'Language preference',
    example: 'en',
  })
  language: string;

  @ApiProperty({
    description: 'Email notification preferences',
    type: NotificationPreferencesDto,
  })
  emailNotifications: NotificationPreferencesDto;

  @ApiProperty({
    description: 'Push notification preferences',
    type: NotificationPreferencesDto,
  })
  pushNotifications: NotificationPreferencesDto;

  @ApiProperty({
    description: 'SMS notification preferences',
    type: NotificationPreferencesDto,
  })
  smsNotifications: NotificationPreferencesDto;

  @ApiProperty({
    description: 'Privacy preferences',
    type: PrivacyPreferencesDto,
  })
  privacy: PrivacyPreferencesDto;

  @ApiProperty({
    description: 'Accessibility preferences',
    type: AccessibilityPreferencesDto,
  })
  accessibility: AccessibilityPreferencesDto;

  @ApiProperty({
    description: 'App preferences',
    type: AppPreferencesDto,
  })
  app: AppPreferencesDto;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;
}
