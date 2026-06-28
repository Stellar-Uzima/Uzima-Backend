import { IsUUID, IsString, IsEnum, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { BadgeType } from '../enums/badge-type.enum';

export class BadgeDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsEnum(BadgeType)
  type: BadgeType;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsInt()
  milestone: number;

  @IsString()
  milestoneType: string;

  @IsBoolean()
  isActive: boolean;
}

export class UserBadgeDto {
  @IsUUID()
  id: string;

  @IsUUID()
  badgeId: string;

  @IsString()
  badgeName: string;

  @IsEnum(BadgeType)
  badgeType: BadgeType;

  @IsString()
  badgeDescription: string;

  @IsString()
  @IsOptional()
  badgeIcon?: string;

  @IsInt()
  badgeMilestone: number;

  @IsString()
  awardedAt: string;
}

export class UserBadgesResponseDto {
  @IsUUID()
  userId: string;

  badges: UserBadgeDto[];

  totalBadges: number;
}

export class BadgeListResponseDto {
  badges: BadgeDto[];

  totalBadges: number;
}
