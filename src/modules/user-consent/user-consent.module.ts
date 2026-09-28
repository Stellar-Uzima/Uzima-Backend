import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserConsentRecord } from './entities/user-consent-record.entity';
import { UserConsentService } from './user-consent.service';
import { UserConsentController } from './user-consent.controller';
import { UserPreferences } from '../../database/entities/user-preferences.entity';

/**
 * Wires up consent and preference records. Services beside this module can
 * gate behaviour on consent via `UserConsentService.hasConsent`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserConsentRecord, UserPreferences])],
  controllers: [UserConsentController],
  providers: [UserConsentService],
  exports: [UserConsentService],
})
export class UserConsentModule {}