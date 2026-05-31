import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { EmailVerification } from '../../../database/entities/email-verification.entity';
import { UsersService } from '../../../auth/services/users.service';
import { EmailTemplateService } from '../../../shared/notifications/services/email-template.service';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(EmailVerification)
    private readonly repo: Repository<EmailVerification>,
    private readonly usersService: UsersService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  async createForUser(userId: string) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    const user = await this.usersService.findById(userId);

    const ev = this.repo.create({ token, expiresAt, user });
    await this.repo.save(ev);

    // Send HTML verification email via EmailTemplateService (issue #664)
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://app.stellaruzima.com';
      const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

      await this.emailTemplateService.sendEmailVerification(user.email, {
        name: user.firstName || user.email,
        verificationLink,
        privacyUrl: `${frontendUrl}/privacy`,
        unsubscribeUrl: `${frontendUrl}/unsubscribe`,
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