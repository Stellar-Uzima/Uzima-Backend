import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: Twilio | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationCode(phoneNumber: string, code: string): Promise<void> {
    await this.sendSms(
      phoneNumber,
      `Your Uzima verification code is ${code}. It expires in 10 minutes.`,
    );
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    const client = this.getTwilioClient();
    const from = this.getTwilioPhoneNumber();

    try {
      const result = await client.messages.create({
        to: phoneNumber,
        from,
        body: message,
      });

      this.logger.log(`SMS sent to ${phoneNumber} via Twilio: ${result.sid}`);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Unknown Twilio error';
      this.logger.error(
        `Failed to send SMS to ${phoneNumber} via Twilio: ${messageText}`,
      );
      throw new InternalServerErrorException('Failed to send SMS');
    }
  }

  private getTwilioClient(): Twilio {
    if (this.twilioClient) {
      return this.twilioClient;
    }

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      throw new InternalServerErrorException(
        'Twilio SMS is not configured',
      );
    }

    this.twilioClient = twilio(accountSid, authToken);

    return this.twilioClient;
  }

  private getTwilioPhoneNumber(): string {
    const from = this.configService.get<string>('TWILIO_PHONE_NUMBER');

    if (!from) {
      throw new InternalServerErrorException(
        'Twilio phone number is not configured',
      );
    }

    return from;
  }
}