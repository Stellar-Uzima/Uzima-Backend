import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationCenterService } from './notification-center.service';
import { GetInboxDto } from './dto/get-inbox.dto';
import {
  MarkReadResultDto,
  NotificationResponseDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import {
  NotificationDeliveryStatusDto,
  PaginatedDeliveryStatusDto,
} from './dto/delivery-status.dto';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../modules/auth/guards/permissions.guard';
import { Permissions } from '../../modules/auth/decorators/permissions.decorator';
import { Permission } from '../../modules/auth/enums/permission.enum';
import { DeliveryStatus } from './entities/notification-delivery-log.entity';
import { NotificationTypeEnum } from './entities/in-app-notification.entity';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@ApiTags('Notification Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationCenterController {
  constructor(private readonly service: NotificationCenterService) {}

  /**
   * GET /notifications
   * Returns paginated inbox for the authenticated user, unread-first.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get notification inbox',
    description: 'Returns paginated in-app notifications for the current user, unread first.',
  })
  @ApiResponse({ status: 200, type: PaginatedNotificationsDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInbox(
    @Req() req: AuthenticatedRequest,
    @Query(new ValidationPipe({ transform: true })) query: GetInboxDto,
  ): Promise<PaginatedNotificationsDto> {
    return this.service.getInbox(req.user.userId, query);
  }

  /**
   * GET /notifications/unread-count
   * Returns the count of unread notifications (uses COUNT, does not fetch rows).
   */
  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the number of unread in-app notifications.',
  })
  @ApiResponse({ status: 200, type: UnreadCountDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUnreadCount(@Req() req: AuthenticatedRequest): Promise<UnreadCountDto> {
    return this.service.getUnreadCount(req.user.userId);
  }

  /**
   * PATCH /notifications/read-all
   * Marks all unread notifications as read in a single DB operation.
   */
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Bulk-marks all unread notifications as read (single UPDATE query).',
  })
  @ApiResponse({ status: 200, type: MarkReadResultDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllRead(@Req() req: AuthenticatedRequest): Promise<MarkReadResultDto> {
    return this.service.markAllRead(req.user.userId);
  }

  /**
   * GET /notifications/delivery-status/history
   * Returns paginated delivery status history across a user's notifications.
   * Useful for audit trails and support workflows.
   * (Must come before :id parameterized routes)
   *
   * Requires: VIEW_NOTIFICATION_DELIVERY_STATUS permission (support+ roles)
   */
  @Get('delivery-status/history')
  @Permissions(Permission.VIEW_NOTIFICATION_DELIVERY_STATUS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get delivery status history',
    description:
      'Returns paginated delivery status records across user notifications. Supports filtering by notification type and delivery status. Requires support-level authorization.',
  })
  @ApiResponse({ status: 200, type: PaginatedDeliveryStatusDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions (support role required)' })
  async getDeliveryStatusHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') notificationType?: string,
    @Query('status') statusFilter?: string,
  ): Promise<PaginatedDeliveryStatusDto> {
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;

    const type = notificationType
      ? (Object.values(NotificationTypeEnum).includes(notificationType as NotificationTypeEnum)
          ? (notificationType as NotificationTypeEnum)
          : undefined)
      : undefined;

    const status = statusFilter
      ? (Object.values(DeliveryStatus).includes(statusFilter as DeliveryStatus)
          ? (statusFilter as DeliveryStatus)
          : undefined)
      : undefined;

    return this.service.getDeliveryStatusHistory(
      req.user.userId,
      pageNum,
      limitNum,
      type,
      status,
    );
  }

  /**
   * PATCH /notifications/:id/read
   * Marks a single notification as read.
   */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a single notification as read',
    description: 'Sets readAt timestamp on the specified notification.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, type: NotificationResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.service.markRead(req.user.userId, id);
  }

  /**
   * GET /notifications/:id/delivery-status
   * Returns comprehensive delivery status for a specific notification.
   * Shows channel-specific delivery outcomes and attempt history.
   *
   * Requires: VIEW_NOTIFICATION_DELIVERY_STATUS permission (support+ roles)
   */
  @Get(':id/delivery-status')
  @Permissions(Permission.VIEW_NOTIFICATION_DELIVERY_STATUS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get delivery status for a notification',
    description:
      'Returns comprehensive delivery status across all channels (in-app, email, push, SMS) for a specific notification. Includes attempt history and provider outcomes without secrets. Requires support-level authorization.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, type: NotificationDeliveryStatusDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions (support role required)' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getDeliveryStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationDeliveryStatusDto> {
    return this.service.getDeliveryStatus(req.user.userId, id);
  }
}
