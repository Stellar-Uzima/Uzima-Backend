import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserConsentRecord,
  ConsentStatus,
  ConsentType,
  ConsentSource,
} from './entities/user-consent-record.entity';
import { RecordConsentDto } from './dto/record-consent.dto';
import {
  UserPreferences,
} from '../../database/entities/user-preferences.entity';

/**
 * Owner of the user's consent and preference records (#1372).
 *
 * Consent records are stored once per `(userId, consentType)` and rewritten
 * on every change, producing an auditable trail via `createdAt`/`updatedAt`,
 * the capture `source` and the policy `version` that was in effect. This is
 * intentionally idempotent, so onboarding and settings re-saves never create
 * duplicates.
 */
@Injectable()
export class UserConsentService {
  private readonly logger = new Logger(UserConsentService.name);

  constructor(
    @InjectRepository(UserConsentRecord)
    private readonly consentRepo: Repository<UserConsentRecord>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepo: Repository<UserPreferences>,
  ) {}

  /**
   * Captures or updates one consent category idempotently.
   */
  async recordConsent(dto: RecordConsentDto): Promise<UserConsentRecord> {
    const { userId, consentType, granted, source, version, reason } = dto;
    const effectiveVersion = version ?? '1.0';
    const effectiveSource = source ?? ConsentSource.API;

    let record = await this.consentRepo.findOne({
      where: { userId, consentType },
    });

    if (granted) {
      if (record) {
        record.status = ConsentStatus.GRANTED;
        record.grantedAt = new Date();
        record.withdrawnAt = null;
        record.reason = null;
        record.source = effectiveSource;
        record.version = effectiveVersion;
        record = await this.consentRepo.save(record);
      } else {
        record = await this.consentRepo.save(
          this.consentRepo.create({
            userId,
            consentType,
            status: ConsentStatus.GRANTED,
            source: effectiveSource,
            version: effectiveVersion,
            grantedAt: new Date(),
            withdrawnAt: null,
            reason: null,
          }),
        );
      }
    } else {
      // Refusal or withdrawal of a previously granted consent.
      const status =
        record?.status === ConsentStatus.GRANTED
          ? ConsentStatus.WITHDRAWN
          : ConsentStatus.DENIED;
      if (record) {
        record.status = status;
        record.source = effectiveSource;
        if (status === ConsentStatus.WITHDRAWN) {
          record.withdrawnAt = new Date();
          record.reason = reason ?? null;
        }
        record = await this.consentRepo.save(record);
      } else {
        record = await this.consentRepo.save(
          this.consentRepo.create({
            userId,
            consentType,
            status: ConsentStatus.DENIED,
            source: effectiveSource,
            version: effectiveVersion,
            grantedAt: null,
            withdrawnAt: null,
            reason: reason ?? null,
          }),
        );
      }
    }

    this.logger.log(
      `Consent recorded userId=${userId} type=${consentType} status=${record.status} source=${effectiveSource}`,
    );
    return record;
  }

  /**
   * Returns the full consent trail for a user (one record per category).
   */
  async getConsents(userId: string): Promise<UserConsentRecord[]> {
    return this.consentRepo.find({
      where: { userId },
      order: { consentType: 'ASC' },
    });
  }

  /**
   * Whether a user currently grants a consent category.
   */
  async hasConsent(userId: string, type: ConsentType): Promise<boolean> {
    const record = await this.consentRepo.findOne({
      where: { userId, consentType: type },
    });
    return record?.status === ConsentStatus.GRANTED;
  }

  /**
   * Produces a portable, human-readable snapshot of a user's consent and
   * preference records — useful for the settings screen and data portability.
   */
  async exportSnapshot(userId: string): Promise<Record<string, unknown>> {
    const [preferences, consents] = await Promise.all([
      this.preferencesRepo.findOne({ where: { userId } }),
      this.getConsents(userId),
    ]);

    if (!preferences && consents.length === 0) {
      throw new NotFoundException(`No preference or consent records for user ${userId}`);
    }

    return {
      userId,
      exportedAt: new Date().toISOString(),
      preferences: preferences
        ? {
            theme: preferences.theme,
            language: preferences.language,
            notifications: preferences.notifications,
            privacy: preferences.privacy,
            accessibility: preferences.accessibility,
            app: preferences.app,
          }
        : null,
      consents: consents.map((c) => ({
        consentType: c.consentType,
        status: c.status,
        source: c.source,
        version: c.version,
        grantedAt: c.grantedAt?.toISOString() ?? null,
        withdrawnAt: c.withdrawnAt?.toISOString() ?? null,
      })),
    };
  }
}