import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationPreference } from '../entities/notification-preference.entity';

// JWT Auth Guard interface
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email?: string;
    phoneNumber?: string;
  };
}

// Mock JWT Guard
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

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationPreferencesController {
  constructor(
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @Get('users/notification-preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Returns the notification preferences for the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification preferences retrieved successfully',
    type: NotificationPreference,
    schema: {
      example: {
        id: 'uuid',
        userId: 'uuid',
        taskReminders: true,
        rewardAlerts: true,
        streakAlerts: true,
        emailNotifications: true,
        smsNotifications: true,
        pushNotifications: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        timezone: 'Africa/Lagos',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification preferences not found',
  })
  async getPreferences(
    @Req() req: AuthenticatedRequest,
  ): Promise<NotificationPreference> {
    return this.notificationPreferencesService.getPreferences(req.user.userId);
  }

  @Patch('users/notification-preferences')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Update notification preferences',
    description:
      'Update the notification preferences for the currently authenticated user. Only provided fields will be updated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification preferences updated successfully',
    type: NotificationPreference,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data - invalid timezone or time format',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification preferences not found',
  })
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() updateDto: UpdatePreferencesDto,
  ): Promise<NotificationPreference> {
    return this.notificationPreferencesService.updatePreferences(
      req.user.userId,
      updateDto,
    );
  }
}
