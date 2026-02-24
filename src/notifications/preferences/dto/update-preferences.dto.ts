import { IsBoolean, IsOptional, IsString, IsTimeZoneString } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

// List of valid IANA timezones for validation
const VALID_TIMEZONES = [
  'Africa/Abidjan',
  'Africa/Accra',
  'Africa/Addis_Ababa',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Baghdad',
  'Asia/Bangkok',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Ho_Chi_Minh',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Belgrade',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Budapest',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Kyiv',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Riga',
  'Europe/Rome',
  'Europe/Sofia',
  'Europe/Stockholm',
  'Europe/Tallinn',
  'Europe/Vienna',
  'Europe/Vilnius',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Guam',
  'Pacific/Honolulu',
  'Pacific/Samoa',
  'UTC',
];

export class UpdatePreferencesDto {
  @ApiProperty({
    description: 'Enable or disable task reminder notifications',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  taskReminders?: boolean;

  @ApiProperty({
    description: 'Enable or disable reward alert notifications',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  rewardAlerts?: boolean;

  @ApiProperty({
    description: 'Enable or disable streak alert notifications',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  streakAlerts?: boolean;

  @ApiProperty({
    description: 'Quiet hours start time (HH:mm format)',
    example: '22:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @ApiProperty({
    description: 'Quiet hours end time (HH:mm format)',
    example: '07:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  quietHoursEnd?: string;

  @ApiProperty({
    description: 'User timezone (IANA timezone string)',
    example: 'Africa/Lagos',
    required: false,
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}

// Validator function to check timezone
export function isValidTimezone(timezone: string): boolean {
  return VALID_TIMEZONES.includes(timezone);
}
