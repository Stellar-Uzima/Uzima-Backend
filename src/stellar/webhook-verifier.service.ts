import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookVerifierService {
  private readonly logger = new Logger(WebhookVerifierService.name);
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.get<string>('STELLAR_WEBHOOK_SECRET', '');
  }

  /**
   * Verifies an incoming Stellar transaction webhook request by comparing
   * the HMAC-SHA256 signature in the `x-stellar-signature` header against
   * the raw request body signed with the shared secret.
   *
   * @param rawBody  Raw request body buffer (before JSON parsing)
   * @param signature  Value of the `x-stellar-signature` header
   * @throws UnauthorizedException if the signature is missing or invalid
   */
  verifySignature(rawBody: Buffer, signature: string): void {
    if (!signature) {
      this.logger.warn('Webhook received without signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      this.logger.warn('Webhook signature mismatch');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log('Webhook signature verified successfully');
  }
}
