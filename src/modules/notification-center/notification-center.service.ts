import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InAppNotification, NotificationTypeEnum } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';
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
  // Mapper
  // ────────────────────────────────────────────────────────────────────────────

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
