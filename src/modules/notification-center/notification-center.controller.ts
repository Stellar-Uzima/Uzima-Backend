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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationCenterService } from './notification-center.service';
import { GetInboxDto, INBOX_MAX_PAGE_SIZE } from './dto/get-inbox.dto';
import {
  MarkReadResultDto,
  NotificationResponseDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@ApiTags('Notification Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationCenterController {
  constructor(private readonly service: NotificationCenterService) {}

  /**
   * GET /notifications
   *
   * Returns a paginated notification history for the authenticated user with:
   * - Bounded page sizes (max {@link INBOX_MAX_PAGE_SIZE} rows per page).
   * - Stable ordering: unread-first, then newest-first, then id DESC tiebreaker.
   * - Optional `unreadOnly` filter to restrict results to unread notifications.
   * - Optional `since` / `until` date-range filters.
   *
   * The `meta.unreadCount` field always reflects the user's total unread count
   * regardless of the active filters, so a badge counter can be derived from
   * any inbox response.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get notification inbox',
    description: [
      'Returns a paginated notification history for the current user.',
      `Page size is capped at ${INBOX_MAX_PAGE_SIZE} rows.`,
      'Results are ordered unread-first, then by createdAt DESC, with id DESC as a tiebreaker for stable paging.',
      'Use `unreadOnly=true` to restrict to unread notifications.',
      'Use `since`/`until` (ISO-8601) to restrict to a date window.',
    ].join(' '),
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-indexed)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: `Rows per page (max ${INBOX_MAX_PAGE_SIZE})`, example: 20 })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean, description: 'Return only unread notifications' })
  @ApiQuery({ name: 'since', required: false, type: String, description: 'ISO-8601 lower bound (inclusive)', example: '2024-01-01T00:00:00.000Z' })
  @ApiQuery({ name: 'until', required: false, type: String, description: 'ISO-8601 upper bound (inclusive)', example: '2024-12-31T23:59:59.999Z' })
  @ApiResponse({ status: 200, type: PaginatedNotificationsDto, description: 'Paginated notifications with metadata' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInbox(
    @Req() req: AuthenticatedRequest,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetInboxDto,
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
    description: 'Returns the number of unread in-app notifications (single COUNT query).',
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
}
