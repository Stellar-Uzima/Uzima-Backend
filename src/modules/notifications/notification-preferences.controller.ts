import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@nestjs/passport';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

type AuthenticatedRequest = Request & { user?: { id?: string; userId?: string } };

@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly service: NotificationPreferencesService,
  ) {}

  private resolveUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user not found on request');
    }
    return userId;
  }

  @Get()
  @HttpCode(200)
  async getPreferences(@Req() req: AuthenticatedRequest) {
    const userId = this.resolveUserId(req);
    return this.service.getOrCreateForUser(userId);
  }

  @Patch()
  @HttpCode(200)
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    const userId = this.resolveUserId(req);
    return this.service.updateForUser(userId, dto);
  }
}
