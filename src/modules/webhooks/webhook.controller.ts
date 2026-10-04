import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

@Controller('webhooks/stellar')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @HttpCode(202)
  receive(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-stellar-signature') signature: string) {
    const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
    return this.webhookService.receive(rawBody, signature, request.body as Record<string, unknown>);
  }
}
