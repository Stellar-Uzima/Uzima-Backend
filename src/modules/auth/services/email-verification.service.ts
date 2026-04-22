import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { EmailVerification } from '../../../database/entities/email-verification.entity';
import { UsersService } from './users.service';
import { NotificationService } from '../../../notifications/services/notification.service';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(EmailVerification)
    private readonly repo: Repository<EmailVerification>,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationService,
  ) {}

  async createForUser(userId: string) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    const user = await this.usersService.findById(userId);

    const ev = this.repo.create({ token, expiresAt, user });
    await this.repo.save(ev);

    // Send email via notifications service (template can be adapted)
    try {
      const verificationLink = `${process.env.FRONTEND_URL || 'https://example.com'}/verify-email?token=${token}`;
      await this.notifications.sendMultiChannel(user.id, {
        email: { template: 'verify-email', data: { name: user.firstName || user.email, link: verificationLink } },
      });
    } catch (err) {
      this.logger.error('Failed to send verification email', err as any);
    }

    return { token, expiresAt };
  }

  async consume(token: string) {
    const record = await this.repo.findOne({ where: { token }, relations: ['user'] });
    if (!record) return null;
    if (record.consumedAt) return null;
    if (record.expiresAt < new Date()) return null;

    record.consumedAt = new Date();
    await this.repo.save(record);
    return record;
  }
}
