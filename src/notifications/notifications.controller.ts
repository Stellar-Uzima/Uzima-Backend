import {
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { NotificationService } from './services/notification.service';
import { Notification } from './entities/notification.entity';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email?: string;
    phoneNumber?: string;
  };
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = { userId: 'mock-user-id' };
    return true;
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get notification list',
    description:
      'Retrieve all notifications for the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of notifications retrieved',
    type: Notification,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getNotifications(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getNotifications(req.user.userId);
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the count of unread notifications.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved',
    schema: {
      example: { count: 3 },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getUnreadCount(req.user.userId);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Mark all of the current user notifications as read.',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
    schema: { example: { updated: 5 } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @Post('seed')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a mock notification (development helper)',
    description: 'Create a notification for the current user (for testing).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'reward' },
        title: { type: 'string', example: 'Reward available' },
        body: { type: 'string', example: 'You earned 10 XLM.' },
      },
      required: ['type', 'title', 'body'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Notification created for user',
    type: Notification,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async seedNotification(
    @Req() req: AuthenticatedRequest,
    @Body() body: { type: string; title: string; body: string },
  ) {
    return this.notificationService.createNotification({
      userId: req.user.userId,
      type: body.type,
      title: body.title,
      body: body.body,
    });
  }
}
