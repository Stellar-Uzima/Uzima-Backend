import { GoneException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EmailVerification } from '../../../database/entities/email-verification.entity';
import { UsersService } from './users.service';
import { NotificationService } from '../../../notifications/services/notification.service';

/** How a verification attempt ended. The caller maps this onto a status code. */
export type ConsumeOutcome =
  | { status: 'OK'; record: EmailVerification }
  | { status: 'NOT_FOUND' }
  | { status: 'ALREADY_USED'; record: EmailVerification }
  | { status: 'EXPIRED'; record: EmailVerification };

export interface IssueResult {
  /** Returned to the owning user only. Never echoed to an unauthenticated caller. */
  token: string;
  expiresAt: Date;
  /** How many older outstanding tokens were invalidated by this issue. */
  supersededCount: number;
}

/**
 * Manages email verification: issues tokens, sends the email, and consumes
 * tokens exactly once (#1284).
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(EmailVerification)
    private readonly repo: Repository<EmailVerification>,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationService,
    private readonly configService: ConfigService,
  ) {
    this.ttlMs = this.configService.get<number>('EMAIL_VERIFICATION_TTL_MS', 24 * 3600 * 1000);
  }

  /**
   * Issues a token and invalidates any that are still outstanding.
   *
   * Two changes from the previous behaviour:
   *
   * 1. **The token is stored as a SHA-256 hash, not in plaintext.** The reset
   *    flow already did this; verification did not, so a read of the
   *    `email_verifications` table (a backup, a replica, a support export) was
   *    a direct path to account takeover for every unverified account. A
   *    lookup hashes the presented token and compares, so a database read
   *    yields nothing usable.
   *
   * 2. **Issuing a token supersedes the previous ones.** Otherwise a user who
   *    requested a resend because the first email went to the wrong address
   *    still has a live token in their inbox history, and anyone who later
   *    gains access to that mailbox history can verify the account.
   */
  async createForUser(userId: string): Promise<IssueResult> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = EmailVerificationService.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    const user = await this.usersService.findById(userId);

    const superseded = await this.repo.find({
      where: { user: { id: userId }, consumedAt: IsNull() },
      select: ['id'],
    });

    if (superseded.length > 0) {
      // Expire rather than delete: keeping the rows preserves the audit trail
      // of how many verification attempts an account has made.
      await this.repo.update(
        superseded.map((row) => row.id),
        { consumedAt: new Date() },
      );
    }

    const record = this.repo.create({
      token: tokenHash,
      expiresAt,
      user,
    } as unknown as EmailVerification);
    await this.repo.save(record);

    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://example.com';
      const verificationLink = `${frontendUrl}/verify-email?token=${token}`;
      await this.notifications.sendMultiChannel(user.id, {
        email: { template: 'email-verification', data: { name: user.firstName || user.email, link: verificationLink } },
      });
    } catch (err) {
      // A mail outage must not fail registration. The user can request a resend.
      this.logger.error('Failed to send verification email', err as any);
    }

    return { token, expiresAt, supersededCount: superseded.length };
  }

  /**
   * Consumes a token. The previous version returned `null` for both "no such
   * token" and "already used", so a user who clicked the link twice saw
   * "invalid or expired" with no way to tell which had happened; the outcome
   * union lets the controller answer 410 for an expired token and 400 for a
   * replay, which is the difference between a support ticket and a silent
   * success.
   */
  async consume(rawToken: string): Promise<ConsumeOutcome> {
    const tokenHash = EmailVerificationService.hashToken(rawToken);

    const record = await this.repo.findOne({ where: { token: tokenHash }, relations: ['user'] });

    if (!record) {
      return { status: 'NOT_FOUND' };
    }

    if (record.consumedAt) {
      // Either a replay of a used token, or one superseded by a resend. Both
      // are "this token will never work", and neither is replayable.
      return { status: 'ALREADY_USED', record };
    }

    if (record.expiresAt < new Date()) {
      return { status: 'EXPIRED', record };
    }

    record.consumedAt = new Date();
    await this.repo.save(record);

    return { status: 'OK', record };
  }

  /** True when the user has any live token, used to rate-limit resends. */
  async hasLiveToken(userId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { user: { id: userId }, consumedAt: IsNull() },
    });
    return count > 0;
  }

  /**
   * Marks every outstanding token as consumed. Used when an admin changes an
   * email address, which must invalidate verification of the old address.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const outstanding = await this.repo.find({
      where: { user: { id: userId }, consumedAt: IsNull() },
      select: ['id'],
    });

    if (outstanding.length === 0) {
      return 0;
    }

    await this.repo.update(
      outstanding.map((row) => row.id),
      { consumedAt: new Date() },
    );
    return outstanding.length;
  }

  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Throws 410 for an expired token, preserving the original contract. */
  static assertNotExpired(outcome: ConsumeOutcome): void {
    if (outcome.status === 'EXPIRED') {
      throw new GoneException('Email verification token has expired');
    }
  }
}
