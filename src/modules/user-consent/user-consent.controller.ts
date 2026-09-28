import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { UserConsentService } from './user-consent.service';
import { RecordConsentDto } from './dto/record-consent.dto';

/**
 * Read/write surface for a user's consent and preference records.
 */
@Controller('user-consents')
export class UserConsentController {
  constructor(private readonly consentService: UserConsentService) {}

  @Get(':userId')
  getConsents(@Param('userId') userId: string) {
    return this.consentService.getConsents(userId);
  }

  @Post(':userId')
  recordConsent(
    @Param('userId') userId: string,
    @Body() dto: RecordConsentDto,
  ) {
    return this.consentService.recordConsent({ ...dto, userId });
  }

  @Get(':userId/export')
  exportSnapshot(@Param('userId') userId: string) {
    return this.consentService.exportSnapshot(userId);
  }
}