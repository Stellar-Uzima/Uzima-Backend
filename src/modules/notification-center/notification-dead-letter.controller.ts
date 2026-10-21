import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { InAppNotification, DeliveryChannel } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog, DeliveryStatus } from './entities/notification-delivery-log.entity';
import { NOTIFICATION_CENTER_QUEUE, RETRY_DELIVERY_JOB } from './constants/notification-center.constants';
import { RetryJobData } from './channel-router.service';

@ApiTags('Admin - Notification Dead Letters')
@ApiBearerAuth()
@Controller('admin/notifications/dead-letters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class NotificationDeadLetterController {
  constructor(
    @InjectRepository(NotificationDeliveryLog) private readonly logs: Repository<NotificationDeliveryLog>,
    @InjectRepository(InAppNotification) private readonly notifications: Repository<InAppNotification>,
    @InjectQueue(NOTIFICATION_CENTER_QUEUE) private readonly queue: Queue<RetryJobData>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Review permanently failed notification deliveries' })
  async list(@Query('limit') limit = '50') {
    const take = Math.max(1, Math.min(100, Number(limit) || 50));
    const [logs, total] = await this.logs.findAndCount({
      where: { status: DeliveryStatus.ESCALATED }, order: { escalatedAt: 'DESC' }, take,
    });
    return {
      data: await Promise.all(logs.map(async (log) => {
        const notification = await this.notifications.findOne({ where: { id: log.notificationId } });
        return {
          id: log.id, notificationId: log.notificationId, userId: notification?.userId ?? null,
          notificationType: notification?.type ?? null, channel: log.channel, status: log.status,
          attempts: log.attempts, failedAt: log.escalatedAt, reason: log.escalatedReason,
          retryHistory: log.retryHistory ?? [],
        };
      })), total,
    };
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay a permanently failed notification delivery' })
  async replay(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.logs.findOne({ where: { id, status: DeliveryStatus.ESCALATED } });
    if (!log) return { success: false, message: 'Dead-letter record not found or is no longer replayable' };
    const notification = await this.notifications.findOne({ where: { id: log.notificationId } });
    if (!notification) return { success: false, message: 'Notification record no longer exists' };
    if (log.status === DeliveryStatus.SENT || notification.deliveredChannels?.includes(log.channel)) {
      return { success: true, alreadyDelivered: true, message: 'Notification channel was already delivered' };
    }
    await this.logs.update(log.id, { status: DeliveryStatus.PENDING, escalatedAt: null, escalatedReason: null });
    try {
      await this.queue.add(RETRY_DELIVERY_JOB, {
        notificationId: notification.id, logId: log.id, channel: log.channel as DeliveryChannel,
        userId: notification.userId, title: notification.title, body: notification.body,
        attempt: log.attempts + 1,
      }, { jobId: `notification-replay-${log.id}`, attempts: 1, removeOnComplete: true, removeOnFail: 50 });
    } catch (error) {
      await this.logs.update(log.id, {
        status: DeliveryStatus.ESCALATED,
        escalatedAt: new Date(),
        escalatedReason: 'REPLAY_QUEUE_ERROR',
      });
      throw error;
    }
    return { success: true, message: 'Notification delivery queued for replay', logId: log.id };
  }
}
