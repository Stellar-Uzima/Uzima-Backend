import { IsUUID, IsString, IsEnum, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadgeType } from '../../../database/entities/badge.entity';

export class BadgeDto {
  @ApiProperty({ description: 'Unique identifier of the badge' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'Display name of the badge' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Category/type of the badge', enum: BadgeType })
  @IsEnum(BadgeType)
  type: BadgeType;

  @ApiProperty({ description: 'Description of what the badge represents' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'URL or icon identifier for the badge' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiProperty({ description: 'Milestone value required to earn the badge' })
  @IsInt()
  milestone: number;

  @ApiProperty({ description: 'Type of milestone (e.g., appointments, referrals)' })
  @IsString()
  milestoneType: string;

  @ApiProperty({ description: 'Whether the badge is currently active' })
  @IsBoolean()
  isActive: boolean;
}

export class UserBadgeDto {
  @ApiProperty({ description: 'Unique identifier of the user-badge association' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'ID of the badge' })
  @IsUUID()
  badgeId: string;

  @ApiProperty({ description: 'Display name of the badge' })
  @IsString()
  badgeName: string;

  @ApiProperty({ description: 'Category/type of the badge', enum: BadgeType })
  @IsEnum(BadgeType)
  badgeType: BadgeType;

  @ApiProperty({ description: 'Description of the badge' })
  @IsString()
  badgeDescription: string;

  @ApiPropertyOptional({ description: 'URL or icon identifier for the badge' })
  @IsString()
  @IsOptional()
  badgeIcon?: string;

  @ApiProperty({ description: 'Milestone value required to earn the badge' })
  @IsInt()
  badgeMilestone: number;

  @ApiProperty({ description: 'Timestamp when the badge was awarded' })
  @IsString()
  awardedAt: string;
}

export class UserBadgesResponseDto {
  @ApiProperty({ description: 'ID of the user' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'List of badges earned by the user', type: [UserBadgeDto] })
  badges: UserBadgeDto[];

  @ApiProperty({ description: 'Total number of badges earned' })
  totalBadges: number;
}

export class BadgeListResponseDto {
  @ApiProperty({ description: 'List of all badges', type: [BadgeDto] })
  badges: BadgeDto[];

  @ApiProperty({ description: 'Total number of badges' })
  totalBadges: number;
}
