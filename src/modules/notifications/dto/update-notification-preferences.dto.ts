import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NotificationCategory,
  NotificationChannel,
} from '../entities/notification-preferences.entity';

const HHMM_REGEXP = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ChannelTogglesDto {
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @IsBoolean()
  @IsOptional()
  sms?: boolean;
}

export class ChannelPreferencesDto {
  @IsBoolean()
  @IsOptional()
  task_reminder?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  streak_alert?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  badge_award?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  appointment_reminder?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  report_ready?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  reward_alert?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  system?: ChannelTogglesDto;

  @IsBoolean()
  @IsOptional()
  coupon_expiry?: ChannelTogglesDto;
}

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  @IsOptional()
  taskReminders?: boolean;

  @IsBoolean()
  @IsOptional()
  rewardAlerts?: boolean;

  @IsBoolean()
  @IsOptional()
  streakAlerts?: boolean;

  @IsString()
  @IsOptional()
  @Matches(HHMM_REGEXP, { message: 'quietHoursStart must be in HH:mm format' })
  quietHoursStart?: string;

  @IsString()
  @IsOptional()
  @Matches(HHMM_REGEXP, { message: 'quietHoursEnd must be in HH:mm format' })
  quietHoursEnd?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;

  @IsObject()
  @IsOptional()
  @Type(() => ChannelPreferencesDto)
  @ValidateNested()
  channelPreferences?: ChannelPreferencesDto;
}
