import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InAppNotification, NotificationTypeEnum } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../entities/user.entity';
import { ChannelRouterService } from './channel-router.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { GetInboxDto, INBOX_MAX_PAGE_SIZE } from './dto/get-inbox.dto';
import {
  InboxPaginationMeta,
  MarkReadResultDto,
  NotificationResponseDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import { PaginationMeta } from '../../common/pagination/paginated-result';

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
  // get_inbox — paginated inbox with filters and stable ordering
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns a page of notifications for `userId` with:
   *
   * - Bounded page sizes (hard-capped at {@link INBOX_MAX_PAGE_SIZE}).
   * - Stable ordering: unread-first, then `createdAt DESC`, then `id DESC`
   *   as a tiebreaker so rows with identical timestamps always appear in a
   *   consistent position across pages.
   * - Optional `unreadOnly` filter: restricts results to unread notifications.
   * - Optional date-range filter via `since` / `until` (ISO-8601).
   *
   * The response includes an `unreadCount` in the meta that reflects the
   * total number of unread notifications for the user, irrespective of the
   * active filters (so the badge counter stays accurate even when the caller
   * filters to a specific date range).
   */
  async getInbox(userId: string, query: GetInboxDto): Promise<PaginatedNotificationsDto> {
    const page = Math.max(1, query.page ?? 1);
    // Enforce the hard cap even if validation was bypassed
    const limit = Math.min(query.limit ?? 20, INBOX_MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId });

    // ── Filter: unread only ──────────────────────────────────────────────────
    if (query.unreadOnly === true) {
      qb.andWhere('n.readAt IS NULL');
    }

    // ── Filter: date range ───────────────────────────────────────────────────
    if (query.since) {
      qb.andWhere('n.createdAt >= :since', { since: query.since });
    }
    if (query.until) {
      qb.andWhere('n.createdAt <= :until', { until: query.until });
    }

    // ── Stable ordering ──────────────────────────────────────────────────────
    // Primary:    unread-first  (NULL readAt → 0, non-NULL → 1)
    // Secondary:  createdAt DESC so newer items appear first within each group
    // Tiebreaker: id DESC ensures a total order even for rows with the same
    //             createdAt (e.g. batch inserts), preventing duplicate/skipped
    //             items on page boundaries.
    qb.orderBy('CASE WHEN n.readAt IS NULL THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    // ── Unread count (not scoped to the active filter) ───────────────────────
    const { count: unreadCount } = await this.getUnreadCount(userId);

    // ── Build PaginatedResult-shaped response ────────────────────────────────
    const safeLimit = limit > 0 ? limit : 1;
    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
    const isEmpty = items.length === 0;

    const baseMeta: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * safeLimit < total,
      hasPreviousPage: page > 1 && total > 0,
      nextPage: page * safeLimit < total ? page + 1 : undefined,
      previousPage: page > 1 && total > 0 ? page - 1 : undefined,
      firstItemIndex: isEmpty ? null : (page - 1) * safeLimit,
      lastItemIndex: isEmpty ? null : (page - 1) * safeLimit + items.length - 1,
    };

    const meta: InboxPaginationMeta = { ...baseMeta, unreadCount };

    return {
      data: items.map(this.toDto),
      meta,
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
