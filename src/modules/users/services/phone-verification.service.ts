import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { SmsService } from '../../../shared/sms/sms.service';

interface PhoneVerificationSession {
  code: string;
  expiresAt: number;
  attempts: number;
  resendCount: number;
  lastSentAt: number;
  phoneNumber: string;
}

interface SendPhoneVerificationResult {
  phoneNumber: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

interface ValidatePhoneVerificationResult {
  valid: boolean;
  phoneNumber: string;
}

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  private readonly verificationSessions = new Map<string, PhoneVerificationSession>();

  private readonly codeTtlMs = 10 * 60 * 1000;
  private readonly resendCooldownMs = 60 * 1000;
  private readonly maxValidationAttempts = 5;
  private readonly maxResends = 3;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly smsService: SmsService,
  ) {}

  async sendCode(
    userId: string,
    phoneNumber?: string,
  ): Promise<SendPhoneVerificationResult> {
    const user = await this.getUserOrThrow(userId);
    const normalizedPhoneNumber = this.resolvePhoneNumber(user, phoneNumber);

    if (user.isVerified && user.phoneNumber === normalizedPhoneNumber) {
      throw new BadRequestException('Phone number is already verified');
    }

    if (user.phoneNumber !== normalizedPhoneNumber || user.isVerified) {
      user.phoneNumber = normalizedPhoneNumber;
      user.isVerified = false;
      await this.userRepository.save(user);
    }

    const session = this.createSession(normalizedPhoneNumber, 0);
    this.verificationSessions.set(userId, session);

    await this.smsService.sendVerificationCode(normalizedPhoneNumber, session.code);

    this.logger.log(`Phone verification code sent for user ${userId}`);

    return this.toSendResult(session);
  }

  async resendCode(userId: string): Promise<SendPhoneVerificationResult> {
    const user = await this.getUserOrThrow(userId);
    const session = this.getActiveSession(userId);

    if (session.resendCount >= this.maxResends) {
      throw new HttpException('Resend limit reached', HttpStatus.TOO_MANY_REQUESTS);
    }

    const now = Date.now();
    const elapsedSinceLastSend = now - session.lastSentAt;
    if (elapsedSinceLastSend < this.resendCooldownMs) {
      throw new HttpException(
        `Please wait ${Math.ceil((this.resendCooldownMs - elapsedSinceLastSend) / 1000)} seconds before requesting another code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const nextSession = this.createSession(
      this.resolvePhoneNumber(user, session.phoneNumber),
      session.resendCount + 1,
    );
    this.verificationSessions.set(userId, nextSession);

    await this.smsService.sendVerificationCode(
      nextSession.phoneNumber,
      nextSession.code,
    );

    this.logger.log(`Phone verification code resent for user ${userId}`);

    return this.toSendResult(nextSession);
  }

  async validateCode(
    userId: string,
    code: string,
  ): Promise<ValidatePhoneVerificationResult> {
    const session = this.getActiveSession(userId);

    if (session.code !== code.trim()) {
      session.attempts += 1;

      if (session.attempts >= this.maxValidationAttempts) {
        this.verificationSessions.delete(userId);
        throw new BadRequestException('Verification code is invalid or expired');
      }

      throw new BadRequestException('Invalid verification code');
    }

    return {
      valid: true,
      phoneNumber: session.phoneNumber,
    };
  }

  async markPhoneAsVerified(userId: string, code: string): Promise<User> {
    const validation = await this.validateCode(userId, code);
    const user = await this.getUserOrThrow(userId);

    user.phoneNumber = validation.phoneNumber;
    user.isVerified = true;

    const updatedUser = await this.userRepository.save(user);
    this.verificationSessions.delete(userId);

    this.logger.log(`Phone number verified for user ${userId}`);

    return updatedUser;
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private getActiveSession(userId: string): PhoneVerificationSession {
    const session = this.verificationSessions.get(userId);

    if (!session || session.expiresAt <= Date.now()) {
      this.verificationSessions.delete(userId);
      throw new BadRequestException('Verification code is invalid or expired');
    }

    return session;
  }

  private resolvePhoneNumber(user: User, phoneNumber?: string): string {
    const rawPhoneNumber = phoneNumber ?? user.phoneNumber;
    const normalizedPhoneNumber = rawPhoneNumber?.replace(/\s+/g, '');

    if (!normalizedPhoneNumber) {
      throw new BadRequestException('Phone number is required');
    }

    return normalizedPhoneNumber;
  }

  private createSession(
    phoneNumber: string,
    resendCount: number,
  ): PhoneVerificationSession {
    const now = Date.now();

    return {
      code: randomInt(100000, 1000000).toString(),
      expiresAt: now + this.codeTtlMs,
      attempts: 0,
      resendCount,
      lastSentAt: now,
      phoneNumber,
    };
  }

  private toSendResult(
    session: PhoneVerificationSession,
  ): SendPhoneVerificationResult {
    return {
      phoneNumber: session.phoneNumber,
      expiresAt: new Date(session.expiresAt),
      resendAvailableAt: new Date(session.lastSentAt + this.resendCooldownMs),
    };
  }
}