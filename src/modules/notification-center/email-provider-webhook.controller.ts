import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { EmailProviderWebhookService } from './email-provider-webhook.service';

/**
 * Email provider callback intake.
 *
 * This route is deliberately not JWT-guarded: providers cannot present user
 * credentials. Every request is authenticated by the HMAC signature over the
 * raw body instead.
 */
@ApiTags('Notification Center')
@Controller('webhooks/email-provider')
export class EmailProviderWebhookController {
  constructor(private readonly service: EmailProviderWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Receive an email provider acceptance/delivery callback' })
  @ApiResponse({
    status: 202,
    description: 'Callback authenticated and recorded (or already recorded)',
  })
  @ApiResponse({ status: 401, description: 'Missing, invalid, or stale provider signature' })
  receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-email-provider-signature') signature: string,
    @Headers('x-email-provider-timestamp') timestamp: string
  ) {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    return this.service.handle(rawBody, signature, timestamp, request.body);
  }
}
