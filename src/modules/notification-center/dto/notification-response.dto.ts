import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationTypeEnum, DeliveryChannel } from '../entities/in-app-notification.entity';
import { PaginationMeta } from '../../../common/pagination/paginated-result';

// ─────────────────────────────────────────────────────────────────────────────
// Individual notification DTO
// ─────────────────────────────────────────────────────────────────────────────

export class NotificationResponseDto {
  @ApiProperty({ description: 'Notification UUID' })
  id: string;

  @ApiProperty({ description: 'Owner user UUID' })
  userId: string;

  @ApiProperty({ enum: NotificationTypeEnum, description: 'Notification type' })
  type: NotificationTypeEnum;

  @ApiProperty({ description: 'Short notification title' })
  title: string;

  @ApiProperty({ description: 'Notification body text' })
  body: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON payload attached to the notification' })
  data: Record<string, any> | null;

  @ApiProperty({ description: 'null = unread; timestamp = when the user read it', nullable: true })
  readAt: Date | null;

  @ApiProperty({ type: [String], enum: DeliveryChannel, description: 'Channels the notification was successfully delivered on' })
  deliveredChannels: string[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox-specific pagination metadata (extends base PaginationMeta)
// ─────────────────────────────────────────────────────────────────────────────

export class InboxPaginationMeta extends PaginationMeta {
  @ApiProperty({ description: 'Total number of unread notifications for this user (not scoped to this page)' })
  unreadCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated inbox response — replaces the old PaginatedNotificationsDto.
// Shape: { data: NotificationResponseDto[], meta: InboxPaginationMeta }
// ─────────────────────────────────────────────────────────────────────────────

export class PaginatedNotificationsDto {
  @ApiProperty({ type: [NotificationResponseDto], description: 'Notifications on this page' })
  data: NotificationResponseDto[];

  @ApiProperty({ type: InboxPaginationMeta, description: 'Pagination metadata including unread count' })
  meta: InboxPaginationMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Miscellaneous response DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class UnreadCountDto {
  @ApiProperty({ description: 'Number of unread notifications' })
  count: number;
}

export class MarkReadResultDto {
  @ApiProperty({ description: 'Number of notifications updated' })
  updated: number;
}
