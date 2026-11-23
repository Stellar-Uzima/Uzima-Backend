import { Body, Controller, Delete, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PushSubscriptionService } from '../../shared/notifications/services/push-subscription.service';
import { RegisterPushSubscriptionDto } from '../../shared/notifications/dto/register-push-subscription.dto';

type AuthenticatedRequest = Request & { user?: { userId?: string } };

@UseGuards(JwtAuthGuard)
@Controller('notifications/push-subscriptions')
export class PushSubscriptionsController {
  constructor(private readonly service: PushSubscriptionService) {}

  private userId(req: AuthenticatedRequest): string {
    const id = req.user?.userId;
    if (!id) throw new Error('Authenticated user not found on request');
    return id;
  }

  @Post()
  async register(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterPushSubscriptionDto,
  ) {
    return this.service.register(this.userId(req), dto.deviceToken, dto.platform);
  }

  @Delete()
  @HttpCode(204)
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Body('deviceToken') deviceToken: string,
  ): Promise<void> {
    await this.service.revoke(this.userId(req), deviceToken);
  }

  @Delete('all')
  @HttpCode(204)
  async revokeAll(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.service.revokeAll(this.userId(req));
  }
}
