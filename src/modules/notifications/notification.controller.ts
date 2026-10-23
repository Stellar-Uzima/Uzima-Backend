import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, Length } from 'class-validator';
import { NotificationTokenService } from './notification-token.service';

class RegisterDeviceTokenDto {
  @IsString()
  @Length(1, 4096)
  token: string;

  @IsIn(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';
}

/**
 * Endpoints letting an authenticated user register and revoke their own
 * push device tokens. All operations are scoped to the caller's user id.
 */
@Controller('notifications/device-tokens')
export class NotificationController {
  constructor(private readonly tokenService: NotificationTokenService) {}

  @Post()
  async register(@Req() req: { user: { id: string } }, @Body() dto: RegisterDeviceTokenDto) {
    const record = await this.tokenService.registerToken({
      userId: req.user.id,
      token: dto.token,
      platform: dto.platform,
    });
    return { id: record.id, platform: record.platform, active: record.active };
  }

  @Get()
  async list(@Req() req: { user: { id: string } }) {
    const tokens = await this.tokenService.listTokens(req.user.id);
    return tokens.map((t) => ({
      id: t.id,
      platform: t.platform,
      active: t.active,
      disabledReason: t.disabledReason,
      createdAt: t.createdAt,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.tokenService.revokeToken(req.user.id, id);
  }
}
