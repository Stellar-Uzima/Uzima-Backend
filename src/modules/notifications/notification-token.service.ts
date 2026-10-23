import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiErrorException } from '../../common/errors/api-error.exception';
import { ApiErrorCode } from '../../common/errors/api-error-codes.enum';
import { DeviceToken } from '../../database/entities/device-token.entity';

export interface RegisterDeviceTokenInput {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
}

/**
 * Manages push notification device tokens across their lifecycle:
 * registration when a device is added, revocation when the user removes a
 * device or uninstalls the app, and disabling of tokens the provider has
 * rejected as invalid so they are never targeted again.
 */
@Injectable()
export class NotificationTokenService {
  private readonly logger = new Logger(NotificationTokenService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokenRepository: Repository<DeviceToken>,
  ) {}

  /**
   * Registers (or re-activates) a device token for the given user. Registering
   * the same token twice is idempotent and simply refreshes ownership.
   */
  async registerToken(input: RegisterDeviceTokenInput): Promise<DeviceToken> {
    const existing = await this.tokenRepository.findOne({ where: { token: input.token } });

    if (existing) {
      if (existing.userId !== input.userId) {
        // Token moved to a different account on the same device.
        existing.userId = input.userId;
      }
      existing.platform = input.platform;
      existing.active = true;
      existing.disabledReason = null;
      existing.disabledAt = null;
      return this.tokenRepository.save(existing);
    }

    const created = this.tokenRepository.create({
      userId: input.userId,
      token: input.token,
      platform: input.platform,
      active: true,
    });
    return this.tokenRepository.save(created);
  }

  /** Lists the caller's own tokens. */
  async listTokens(userId: string): Promise<DeviceToken[]> {
    return this.tokenRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revokes one of the caller's own tokens. Users cannot revoke tokens owned
   * by other accounts; an unknown or foreign id is reported as not found.
   */
  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const record = await this.tokenRepository.findOne({ where: { id: tokenId, userId } });
    if (!record) {
      throw new ApiErrorException(ApiErrorCode.NOT_FOUND, 'Device token not found');
    }
    if (!record.active) {
      return;
    }
    record.active = false;
    record.disabledReason = 'REVOKED_BY_USER';
    record.disabledAt = new Date();
    await this.tokenRepository.save(record);
    this.logger.log(`Device token ${tokenId} revoked by user ${userId}`);
  }

  /**
   * Returns the active tokens to deliver to for a user. Tokens previously
   * disabled by the provider or by the user are excluded.
   */
  async getActiveTokens(userId: string): Promise<DeviceToken[]> {
    return this.tokenRepository.find({ where: { userId, active: true } });
  }

  /**
   * Called by the delivery path when the provider reports a token as invalid
   * (e.g. FCM UNREGISTERED / INVALID_ARGUMENT). The token is disabled so it is
   * not repeatedly targeted by future sends.
   */
  async disableInvalidToken(token: string, reason: string): Promise<void> {
    const record = await this.tokenRepository.findOne({ where: { token } });
    if (!record || !record.active) {
      return;
    }
    record.active = false;
    record.disabledReason = reason.slice(0, 255);
    record.disabledAt = new Date();
    await this.tokenRepository.save(record);
    this.logger.warn(`Disabled invalid device token ${record.id}: ${reason}`);
  }
}
