import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InAppNotification, NotificationTypeEnum } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog, DeliveryStatus } from './entities/notification-delivery-log.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../entities/user.entity';
import { ChannelRouterService } from './channel-router.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { GetInboxDto } from './dto/get-inbox.dto';
import {
  NotificationResponseDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
  MarkReadResultDto,
} from './dto/notification-response.dto';
import {
  NotificationDeliveryStatusDto,
  ChannelDeliveryStatusDto,
  DeliveryAttemptDto,
  PaginatedDeliveryStatusDto,
} from './dto/delivery-status.dto';

@Injectable()
/**
 * Coordinates in-app notifications: persists notification records,
 * dispatches them to enabled delivery channels (push, email, etc.),
 * and exposes inbox, unread-count, and mark-read operations.
 */
export class NotificationCenterService {
  private readonly logger = new Logger(NotificationCenterService.name);

  constructor(
    @InjectRepository(InAppNotification)
    private readonly notificationRepo: Repository<InAppNotification>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryLogRepo: Repository<NotificationDeliveryLog>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly channelRouter: ChannelRouterService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // send_notification — unified entry point
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Creates an in-app notification record and dispatches to all channels
   * that are enabled in the user's preferences.
   *
   * The in-app record is always persisted regardless of channel delivery
   * success or failure.
   */
  async sendNotification(dto: SendNotificationDto): Promise<InAppNotification> {
    const { userId, type, title, body, data } = dto;

    // 1. Persist in-app notification first (always succeeds)
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        userId,
        type,
        title,
        body,
        data: data ?? null,
        readAt: null,
        deliveredChannels: ['in_app'],
      }),
    );

    this.logger.log(
      `In-app notification created: id=${notification.id} userId=${userId} type=${type}`,
    );

    // 2. Load user and preferences (best-effort; missing data skips channels)
    const [user, preferences] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.preferenceRepo.findOne({ where: { userId } }),
    ]);

    if (!user) {
      this.logger.warn(`User ${userId} not found — channel routing skipped`);
      return notification;
    }

    // 3. Route to enabled channels (non-blocking — failures are retried)
    this.channelRouter
      .route({ notification, user, preferences })
      .catch((err) =>
        this.logger.error(`Channel routing error for notification ${notification.id}: ${err?.message}`),
      );

    return notification;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // get_inbox — paginated inbox, unread-first
  // ────────────────────────────────────────────────────────────────────────────

  async getInbox(userId: string, query: GetInboxDto): Promise<PaginatedNotificationsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      // Unread first: NULL readAt sorts before non-NULL
      .orderBy('CASE WHEN n.readAt IS NULL THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('n.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const unreadCount = await this.getUnreadCount(userId);

    return {
      items: items.map(this.toDto),
      total,
      page,
      limit,
      unreadCount: unreadCount.count,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // get_unread_count — performant COUNT query
  // ────────────────────────────────────────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<UnreadCountDto> {
    const count = await this.notificationRepo.count({
      where: { userId, readAt: IsNull() },
    });
    return { count };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // mark_read — mark a single notification as read
  // ────────────────────────────────────────────────────────────────────────────

  async markRead(userId: string, notificationId: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notification ${notificationId} not found for user ${userId}`,
      );
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }

    return this.toDto(notification);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // mark_all_read — bulk UPDATE (single DB round-trip, no N+1)
  // ────────────────────────────────────────────────────────────────────────────

  async markAllRead(userId: string): Promise<MarkReadResultDto> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(InAppNotification)
      .set({ readAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('readAt IS NULL')
      .execute();

    const updated = result.affected ?? 0;
    this.logger.log(`markAllRead: updated ${updated} notifications for user ${userId}`);
    return { updated };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // get_delivery_status — per-notification delivery status snapshot
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns comprehensive delivery status for a specific notification.
   * Used by support workflows to inspect delivery outcomes across channels.
   *
   * @param userId User ID (for authorization — only the recipient can view their notification status)
   * @param notificationId Notification ID to inspect
   * @returns Delivery status across all channels
   * @throws NotFoundException if notification not found
   */
  async getDeliveryStatus(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDeliveryStatusDto> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notification ${notificationId} not found for user ${userId}`,
      );
    }

    // Fetch all delivery logs for this notification
    const logs = await this.deliveryLogRepo.find({
      where: { notificationId },
    });

    // Build channel status map
    const channelStatusMap = new Map<string, ChannelDeliveryStatusDto>();

    // Ensure all channels have at least a status entry
    const allChannels = ['in_app', 'email', 'push', 'sms'];
    for (const channel of allChannels) {
      const log = logs.find((l) => l.channel === channel);

      if (log) {
        channelStatusMap.set(channel, this.toChannelDeliveryStatusDto(log));
      } else if (channel === 'in_app') {
        // In-app is always "sent" (created with the notification)
        channelStatusMap.set(channel, {
          channel: 'in_app',
          status: DeliveryStatus.SENT,
          attempts: 1,
          lastAttemptedAt: notification.createdAt,
          lastError: null,
          retryHistory: [
            {
              attempt: 1,
              at: notification.createdAt.toISOString(),
              reason: 'SUCCESS',
            },
          ],
        });
      } else {
        // Other channels with no log are not applicable for this notification
        channelStatusMap.set(channel, {
          channel,
          status: DeliveryStatus.PENDING,
          attempts: 0,
          lastAttemptedAt: null,
          lastError: null,
          retryHistory: [],
        });
      }
    }

    // Calculate overall status
    const channels = Array.from(channelStatusMap.values());
    const successfulChannels = channels
      .filter((c) => c.status === DeliveryStatus.SENT)
      .map((c) => c.channel);
    const failedChannels = channels
      .filter((c) => c.status !== DeliveryStatus.SENT)
      .map((c) => c.channel);

    let overallStatus: 'all_delivered' | 'partially_delivered' | 'all_pending' | 'all_failed';
    if (successfulChannels.length === channels.length) {
      overallStatus = 'all_delivered';
    } else if (successfulChannels.length > 0) {
      overallStatus = 'partially_delivered';
    } else if (channels.every((c) => c.status === DeliveryStatus.PENDING)) {
      overallStatus = 'all_pending';
    } else {
      overallStatus = 'all_failed';
    }

    return {
      notificationId: notification.id,
      userId: notification.userId,
      notificationType: notification.type,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt,
      channels,
      overallStatus,
      successfulChannels,
      failedChannels,
    };
  }

  /**
   * Returns paginated delivery status history across a user's notifications.
   * Useful for audit trails and support workflows.
   *
   * @param userId User ID (for authorization)
   * @param page Page number (1-indexed, default: 1)
   * @param limit Records per page (default: 20, max: 100)
   * @param notificationType Optional filter by notification type
   * @param statusFilter Optional filter by delivery status (sent, failed, pending, escalated)
   * @returns Paginated delivery status records
   */
  async getDeliveryStatusHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
    notificationType?: NotificationTypeEnum,
    statusFilter?: DeliveryStatus,
  ): Promise<PaginatedDeliveryStatusDto> {
    // Clamp limit to max 100
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    // Build base query for notifications
    let query = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (notificationType) {
      query = query.andWhere('n.type = :notificationType', { notificationType });
    }

    const [notifications, total] = await query
      .skip(skip)
      .take(safeLimit)
      .getManyAndCount();

    // Fetch delivery logs for all these notifications
    const notificationIds = notifications.map((n) => n.id);
    let logsQuery = this.deliveryLogRepo
      .createQueryBuilder('dl')
      .whereInIds(notificationIds, { notificationIds });

    if (statusFilter) {
      logsQuery = logsQuery.andWhere('dl.status = :status', { status: statusFilter });
    }

    const logs = await logsQuery.getMany();
    const logsByNotificationId = new Map<
      string,
      NotificationDeliveryLog[]
    >();
    for (const log of logs) {
      if (!logsByNotificationId.has(log.notificationId)) {
        logsByNotificationId.set(log.notificationId, []);
      }
      logsByNotificationId.get(log.notificationId)!.push(log);
    }

    // Build DTO for each notification
    const items: NotificationDeliveryStatusDto[] = [];
    for (const notification of notifications) {
      const notificationLogs = logsByNotificationId.get(notification.id) || [];

      // Build channel status map
      const channelStatusMap = new Map<string, ChannelDeliveryStatusDto>();
      for (const log of notificationLogs) {
        channelStatusMap.set(log.channel, this.toChannelDeliveryStatusDto(log));
      }

      // In-app is always sent
      if (!channelStatusMap.has('in_app')) {
        channelStatusMap.set('in_app', {
          channel: 'in_app',
          status: DeliveryStatus.SENT,
          attempts: 1,
          lastAttemptedAt: notification.createdAt,
          lastError: null,
          retryHistory: [
            {
              attempt: 1,
              at: notification.createdAt.toISOString(),
              reason: 'SUCCESS',
            },
          ],
        });
      }

      // Calculate overall status
      const channels = Array.from(channelStatusMap.values());
      const successfulChannels = channels
        .filter((c) => c.status === DeliveryStatus.SENT)
        .map((c) => c.channel);
      const failedChannels = channels
        .filter((c) => c.status !== DeliveryStatus.SENT)
        .map((c) => c.channel);

      let overallStatus: 'all_delivered' | 'partially_delivered' | 'all_pending' | 'all_failed';
      if (successfulChannels.length === channels.length) {
        overallStatus = 'all_delivered';
      } else if (successfulChannels.length > 0) {
        overallStatus = 'partially_delivered';
      } else if (channels.every((c) => c.status === DeliveryStatus.PENDING)) {
        overallStatus = 'all_pending';
      } else {
        overallStatus = 'all_failed';
      }

      items.push({
        notificationId: notification.id,
        userId: notification.userId,
        notificationType: notification.type,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt,
        channels,
        overallStatus,
        successfulChannels,
        failedChannels,
      });
    }

    const totalPages = Math.ceil(total / safeLimit);

    return {
      items,
      total,
      page,
      limit: safeLimit,
      totalPages,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Mappers
  // ────────────────────────────────────────────────────────────────────────────

  private toChannelDeliveryStatusDto(log: NotificationDeliveryLog): ChannelDeliveryStatusDto {
    const retryHistory: DeliveryAttemptDto[] = Array.isArray(log.retryHistory)
      ? log.retryHistory.map((h) => ({
          attempt: h.attempt,
          at: h.at,
          reason: h.reason,
        }))
      : [];

    return {
      channel: log.channel,
      status: log.status,
      attempts: log.attempts,
      lastAttemptedAt: log.attemptedAt,
      lastError: log.errorMessage,
      retryHistory,
      escalatedAt: log.escalatedAt,
      escalatedReason: log.escalatedReason,
    };
  }

  private toDto(n: InAppNotification): NotificationResponseDto {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      readAt: n.readAt,
      deliveredChannels: n.deliveredChannels,
      createdAt: n.createdAt,
    };
  }
}
