import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from '../entities/notification-delivery-log.entity';

/**
 * Represents a single provider attempt for a notification channel.
 * Records the outcome, timestamp, and categorized error reason without exposing secrets.
 */
export class DeliveryAttemptDto {
  @ApiProperty({
    description: 'Attempt number (1-indexed)',
    example: 1,
  })
  attempt: number;

  @ApiProperty({
    description: 'ISO 8601 timestamp when this attempt was made',
    example: '2024-10-22T14:30:45.123Z',
  })
  at: string;

  @ApiProperty({
    description:
      'Categorized reason for failure (RATE_LIMIT, TIMEOUT, NETWORK, DESTINATION_UNAVAILABLE, PROVIDER_ERROR, etc.)',
    example: 'NETWORK',
  })
  reason: string;
}

/**
 * Delivery status for a single channel for a notification.
 * Exposes channel-specific delivery state without secrets.
 */
export class ChannelDeliveryStatusDto {
  @ApiProperty({
    description: 'Channel identifier',
    enum: ['in_app', 'email', 'push', 'sms'],
    example: 'email',
  })
  channel: string;

  @ApiProperty({
    description: 'Current delivery status for this channel',
    enum: ['pending', 'sent', 'failed', 'escalated'],
    example: 'sent',
  })
  status: DeliveryStatus;

  @ApiProperty({
    description: 'Number of delivery attempts made',
    example: 2,
  })
  attempts: number;

  @ApiProperty({
    description: 'ISO 8601 timestamp of the last delivery attempt',
    nullable: true,
    example: '2024-10-22T14:30:45.123Z',
  })
  lastAttemptedAt: Date | null;

  @ApiPropertyOptional({
    description: 'Most recent error message (safe, no secrets)',
    example: 'User has no email address',
  })
  lastError?: string | null;

  @ApiProperty({
    type: [DeliveryAttemptDto],
    description: 'Bounded retry history (up to 20 attempts) in chronological order',
  })
  retryHistory: DeliveryAttemptDto[];

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp when delivery was escalated for operational review',
    nullable: true,
  })
  escalatedAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Human-readable reason for escalation',
    example: 'Delivery exhausted all retry attempts without acknowledgement',
  })
  escalatedReason?: string | null;
}

/**
 * Complete delivery status snapshot for a notification across all channels.
 * Used by support workflows to inspect delivery outcomes without secrets.
 */
export class NotificationDeliveryStatusDto {
  @ApiProperty({
    description: 'Notification ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  notificationId: string;

  @ApiProperty({
    description: 'User ID who received the notification',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId: string;

  @ApiProperty({
    description: 'Notification type',
    enum: [
      'task_reminder',
      'streak_alert',
      'badge_award',
      'appointment_reminder',
      'report_ready',
      'reward_alert',
      'system',
      'coupon_expiry',
    ],
    example: 'task_reminder',
  })
  notificationType: string;

  @ApiProperty({
    description: 'Notification title',
    example: 'Daily Task Reminder',
  })
  title: string;

  @ApiProperty({
    description: 'Notification body',
    example: 'You have pending tasks to complete',
  })
  body: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when notification was created',
    example: '2024-10-22T14:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    type: [ChannelDeliveryStatusDto],
    description: 'Per-channel delivery status',
  })
  channels: ChannelDeliveryStatusDto[];

  @ApiProperty({
    description: 'Overall delivery outcome summary',
    example: 'partially_delivered',
    enum: ['all_delivered', 'partially_delivered', 'all_pending', 'all_failed'],
  })
  overallStatus: 'all_delivered' | 'partially_delivered' | 'all_pending' | 'all_failed';

  @ApiProperty({
    description: 'Array of successfully delivered channels',
    type: [String],
    example: ['in_app', 'push'],
  })
  successfulChannels: string[];

  @ApiProperty({
    description: 'Array of failed or pending channels',
    type: [String],
    example: ['email'],
  })
  failedChannels: string[];
}

/**
 * Paginated delivery status history for audit and support workflows.
 */
export class PaginatedDeliveryStatusDto {
  @ApiProperty({
    type: [NotificationDeliveryStatusDto],
    description: 'Delivery status records for this page',
  })
  items: NotificationDeliveryStatusDto[];

  @ApiProperty({
    description: 'Total number of records matching the query',
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number (1-indexed)',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of records per page',
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 8,
  })
  totalPages: number;
}
