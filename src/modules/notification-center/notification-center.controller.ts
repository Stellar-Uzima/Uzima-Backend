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
