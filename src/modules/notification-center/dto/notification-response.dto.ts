import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationTypeEnum, DeliveryChannel } from '../entities/in-app-notification.entity';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: NotificationTypeEnum })
  type: NotificationTypeEnum;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional()
  data: Record<string, any> | null;

  @ApiProperty({ description: 'null = unread; timestamp = when user read it' })
  readAt: Date | null;

  @ApiProperty({ type: [String], enum: DeliveryChannel })
  deliveredChannels: string[];

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedNotificationsDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ description: 'Total number of notifications matching the query' })
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty({ description: 'Number of unread notifications for the user' })
  unreadCount: number;
}

export class UnreadCountDto {
  @ApiProperty()
  count: number;
}

export class MarkReadResultDto {
  @ApiProperty({ description: 'Number of notifications updated' })
  updated: number;
}
