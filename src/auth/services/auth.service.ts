import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { AccountLockedException } from '../exceptions/account-locked.exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { MoreThan, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { createClient, RedisClientType } from 'redis';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { Role } from '../enums/role.enum';
import { UsersService } from './users.service';
import { OtpService } from '../../otp/otp.service';
import { PhoneLoginDto } from '../dto/phone-login.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { VerifyEmailDto, ResendEmailVerificationDto } from '../dto/verify-email.dto';
import { AuditService } from '../../audit/audit.service';
import { EmailVerificationService } from '@/modules/auth/services/email-verification.service';
import { SessionService } from '@/modules/auth/services/session.service';
import { TokenBlacklist } from '@/database/entities/token-blacklist.entity';
import { TransactionService } from '@/database/services/transaction.service';
import { ReferralService } from '../../referral/referral.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: RedisClientType;
  private readonly blacklistCache = new Map<string, { blacklisted: boolean; expiresAt: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly maxFailedLoginAttempts = parseInt(
    process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5',
    10,
  );
  private readonly lockoutDurationMs = parseInt(
    process.env.ACCOUNT_LOCKOUT_DURATION_MS || String(15 * 60 * 1000),
    10,
  );

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
    private otpService: OtpService,
    private auditService: AuditService,
    private emailVerificationService: EmailVerificationService,
    private sessionService: SessionService,
    private transactionService: TransactionService,
    @InjectRepository(TokenBlacklist)
    private tokenBlacklistRepo: Repository<TokenBlacklist>,
    @Optional() private readonly referralService?: ReferralService,
  ) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect();
  }

  // Register user
  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.create({
      ...dto,
      password: hashedPassword,
    });

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
    });

    if (dto.referralCode && this.referralService) {
      try {
        await this.referralService.redeemReferralCode(user.id, dto.referralCode);
      } catch (error) {
        this.logger.warn(
          `Referral code not applied for user ${user.id}: ${(error as Error).message}`,
        );
      }
    }

    // Create email verification token and send email
    if (user.email) {
      await this.emailVerificationService.createForUser(user.id);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const profile = await this.usersService.getProfile(user.id);

    return {
      ...tokens,
      user: profile,
    };
  }

  // Login user
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedException(user.lockedUntil);
    }

    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      user.lockedUntil = null;
      user.failedLoginAttempts = 0;
      await this.usersService.save(user);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check user status - prevent login for inactive or suspended users
    const loginCheck = await this.usersService.canUserLogin(user.id);
    if (!loginCheck.canLogin) {
      this.logger.warn(`Login attempt blocked for user ${user.id}: ${loginCheck.reason}`);
      throw new UnauthorizedException(loginCheck.reason || 'Account access denied');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    // Update last login timestamp tracking on successful email login
    await this.usersService.updateLastLogin(user.id);
    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException('Two-factor authentication code is required');
      }
      if (!user.twoFactorSecret || !authenticator.check(dto.totpCode, user.twoFactorSecret)) {
        await this.recordFailedLogin(user);
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.usersService.save(user);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const profile = await this.usersService.getProfile(user.id);

    return {
      ...tokens,
      user: profile,
    };
  }

  async enableTwoFactor(userId: string, code?: string) {
    const user = await this.usersService.findById(userId);
    const secret = authenticator.generateSecret();
    user.twoFactorSecret = secret;

    if (code) {
      if (!authenticator.check(code, secret)) {
        throw new BadRequestException('Invalid authentication code');
      }
      user.twoFactorEnabled = true;
      await this.usersService.save(user);
      return { message: 'Two-factor authentication enabled successfully', enabled: true };
    }

    await this.usersService.save(user);
    const otpauthUrl = authenticator.keyuri(user.email || userId, 'Stellar Uzima', secret);
    const qrCode = await qrcode.toDataURL(otpauthUrl);

    return {
      secret,
      qrCode,
      otpauthUrl,
      enabled: false,
      message: 'Scan the QR code with your authenticator app, then confirm with a TOTP code',
    };
  }

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.usersService.findById(userId);

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    if (!authenticator.check(code, user.twoFactorSecret)) {
      throw new BadRequestException('Invalid authentication code');
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await this.usersService.save(user);

    return { message: 'Two-factor authentication disabled successfully' };
  }

  private async recordFailedLogin(user: { id: string; failedLoginAttempts?: number; lockedUntil?: Date | null }) {
    const fullUser = await this.usersService.findById(user.id);
    fullUser.failedLoginAttempts = (fullUser.failedLoginAttempts || 0) + 1;

    if (fullUser.failedLoginAttempts >= this.maxFailedLoginAttempts) {
      fullUser.lockedUntil = new Date(Date.now() + this.lockoutDurationMs);
      this.logger.warn(`Account locked for user ${fullUser.id} until ${fullUser.lockedUntil.toISOString()}`);
    }

    await this.usersService.save(fullUser);

    if (fullUser.lockedUntil && fullUser.lockedUntil > new Date()) {
      throw new AccountLockedException(fullUser.lockedUntil);
    }
  }

  // Refresh access token
  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const { sub: userId, tokenId } = payload;

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      const key = `refresh:${userId}:${tokenId}`;
      const storedToken = await this.redisClient.get(key);

      if (!storedToken || storedToken !== refreshToken) {
        // Replay attack or invalid token: clear all user sessions
        await this.clearAllUserRefreshTokens(userId);
        // Also clear persisted token on the user entity
        const user = await this.usersService.findById(userId);
        user.refreshToken = null;
        user.refreshTokenExpiry = null;
        await this.usersService.save(user);
        this.eventEmitter.emit('auth.suspicious_activity', {
          userId,
          reason: 'Invalid or reused refresh token',
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Validate against persisted hashed token on user entity
      const user = await this.usersService.findById(userId);
      if (
        !user.refreshToken ||
        !user.refreshTokenExpiry ||
        user.refreshTokenExpiry < new Date() ||
        !(await bcrypt.compare(refreshToken, user.refreshToken))
      ) {
        await this.redisClient.del(key);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Delete the used token (rotation: old token invalidated)
      await this.redisClient.del(key);
      user.refreshToken = null;
      user.refreshTokenExpiry = null;
      await this.usersService.save(user);

      return this.generateTokens(user.id, user.email, user.role);
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const tokenId = crypto.randomUUID();
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const accessToken = this.jwtService.sign({ sub: userId, email, role }, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, role, tokenId },
      { expiresIn: '7d' }
    );

    // Store in Redis for fast lookup
    const key = `refresh:${userId}:${tokenId}`;
    await this.redisClient.set(key, refreshToken, { EX: 7 * 24 * 60 * 60 });

    // Persist hashed refresh token to user entity for durable rotation
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const user = await this.usersService.findById(userId);
    user.refreshToken = hashedRefreshToken;
    user.refreshTokenExpiry = refreshExpiry;
    await this.usersService.save(user);

    // Record session metadata in DB (device info can be passed later)
    try {
      await this.sessionService.createSession(userId, tokenId);
    } catch (err) {
      this.logger.warn('Failed to record session in DB', err as any);
    }

    return { accessToken, refreshToken };
  }

  // Logout with optimized transaction handling
  async logout(refreshToken: string): Promise<void> {
    const startTime = Date.now();
    let userId: string | undefined;
    let tokenId: string;
    let expiresAt = 0;

    try {
      const payload = this.jwtService.verify(refreshToken) as { sub: string; tokenId: string; exp: number };
      userId = payload.sub;
      tokenId = payload.tokenId;
      expiresAt = payload.exp;

      if (!userId || !tokenId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const contextId = `logout-${userId}-${Date.now()}`;
      this.logger.debug(`Starting logout for user ${userId}`);

      // Check if token is already blacklisted (fast check)
      const isAlreadyBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isAlreadyBlacklisted) {
        this.logger.warn(`Attempted logout with already blacklisted token for user ${userId}`);
      }

      // Execute logout operations within a transaction
      await this.transactionService.execute(
        contextId,
        async (queryRunner) => {
          // Blacklist the refresh token (only if not already blacklisted)
          if (!isAlreadyBlacklisted) {
            await queryRunner.manager.save(TokenBlacklist, {
              token: refreshToken,
              tokenType: 'refresh',
              userId,
              expiresAt: new Date(expiresAt * 1000),
            });

            // Update cache immediately
            this.blacklistCache.set(refreshToken, {
              blacklisted: true,
              expiresAt: Date.now() + this.CACHE_TTL,
            });

            this.logger.debug(`Refresh token blacklisted for user ${userId}`);
          }

          // Clear the session
          const sessionRevoked = await this.sessionService.revokeSession(tokenId);
          if (sessionRevoked) {
            this.logger.debug(`Session revoked for user ${userId}, tokenId: ${tokenId}`);
          } else {
            this.logger.warn(`No active session found for tokenId: ${tokenId}`);
          }
        },
        {
          isolationLevel: 'READ COMMITTED',
          timeout: 5000,
        }
      );

      // Clean up Redis (outside transaction for performance)
      try {
        const redisKey = `refresh:${userId}:${tokenId}`;
        const redisDeleted = await this.redisClient.del(redisKey);
        if (redisDeleted > 0) {
          this.logger.debug(`Redis token cleaned up for user ${userId}`);
        }
      } catch (redisError: any) {
        // Redis failure shouldn't fail the logout
        this.logger.warn(`Redis cleanup failed for user ${userId}: ${redisError.message}`);
      }

      // Clear persisted refresh token on user entity
      try {
        const user = await this.usersService.findById(userId);
        user.refreshToken = null;
        user.refreshTokenExpiry = null;
        await this.usersService.save(user);
      } catch (err: any) {
        this.logger.warn(`Failed to clear user refresh token fields: ${err.message}`);
      }

      // Log successful logout with performance metrics
      const duration = Date.now() - startTime;
      this.logger.log(`User ${userId} logged out successfully in ${duration}ms`);

      // Emit logout event for audit/logging
      this.eventEmitter.emit('user.logged_out', {
        userId,
        tokenId,
        timestamp: new Date(),
        duration,
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`Logout failed for user ${userId} after ${duration}ms: ${error.message}`, error.stack);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new InternalServerErrorException('Logout operation failed');
    }
  }

  private async isTokenBlacklisted(token: string): Promise<boolean> {
    const now = Date.now();

    // Check cache first
    const cached = this.blacklistCache.get(token);
    if (cached && cached.expiresAt > now) {
      return cached.blacklisted;
    }

    try {
      const blacklistedToken = await this.tokenBlacklistRepo.findOne({
        where: { token },
      });

      const isBlacklisted = !!blacklistedToken;

      // Cache the result
      this.blacklistCache.set(token, {
        blacklisted: isBlacklisted,
        expiresAt: now + this.CACHE_TTL,
      });

      // Clean up expired cache entries periodically
      if (this.blacklistCache.size > 1000) {
        this.cleanupExpiredCache();
      }

      return isBlacklisted;
    } catch (error: any) {
      this.logger.error(`Error checking token blacklist: ${error.message}`);
      return false;
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [token, data] of this.blacklistCache.entries()) {
      if (data.expiresAt <= now) {
        this.blacklistCache.delete(token);
      }
    }
  }

  async cleanupExpiredBlacklistedTokens(): Promise<number> {
    try {
      const result = await this.tokenBlacklistRepo.delete({
        expiresAt: LessThan(new Date()),
      });
      const deletedCount = result.affected || 0;

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired blacklisted tokens`);
      }

      return deletedCount;
    } catch (error: any) {
      this.logger.error(`Failed to cleanup expired tokens: ${error.message}`);
      return 0;
    }
  }

  private async clearAllUserRefreshTokens(userId: string) {
    const pattern = `refresh:${userId}:*`;
    const keys = await this.redisClient.keys(pattern);
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
  }

  /**
   * Phone OTP Flow
   */
  async requestPhoneOtp(phoneLoginDto: PhoneLoginDto) {
    return this.otpService.requestOtp(phoneLoginDto.phoneNumber);
  }

  async verifyPhoneOtp(verifyOtpDto: VerifyOtpDto) {
    const verificationResult = await this.otpService.verifyOtp(
      verifyOtpDto.phoneNumber,
      verifyOtpDto.otp
    );
    if (!verificationResult.success) {
      throw new UnauthorizedException(verificationResult.message);
    }

    let user = await this.usersService.findByPhoneNumber(verifyOtpDto.phoneNumber);
    const isNewUser = !user;

    if (isNewUser) {
      // Create minimal user for phone login
      user = await this.usersService.create({
        phoneNumber: verifyOtpDto.phoneNumber,
        firstName: 'Phone',
        lastName: 'User',
        email: undefined,
        password: undefined,
      });
      this.logger.log(`New user registered via phone: ${verifyOtpDto.phoneNumber}`);
    }

    // Type Guard to reassure TypeScript compiler that 'user' is guaranteed to exist
    if (!user) {
      throw new UnauthorizedException('Authentication failed: User profile mapping failed.');
    }

    // Update last login timestamp tracking on successful phone OTP validation
    await this.usersService.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user.id, user.email || user.phoneNumber, user.role);
    const tokens = await this.generateTokens(user!.id, user!.email || user!.phoneNumber, user!.role);
    return {
      success: true,
      message: 'Authentication successful',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user!.id,
        phoneNumber: user!.phoneNumber,
        isNewUser,
      },
    };
  }

  // Verify email
  async verifyEmail(dto: VerifyEmailDto) {
    const record = await this.emailVerificationService.consume(dto.token);
    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const user: any = record.user;
    user.isVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;
    await this.usersService.save(user);

    this.eventEmitter.emit('user.email.verified', {
      userId: user.id,
      email: user.email,
    });

    await this.auditService.logAction(user.id, `Email verified: ${user.email}`);

    return { message: 'Email verified successfully' };
  }

  // Resend email verification
  async resendEmailVerification(dto: ResendEmailVerificationDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const rateLimitKey = `email_verify:${user.email}`;
    const currentCount = await this.redisClient.get(rateLimitKey);

    if (currentCount && parseInt(String(currentCount), 10) >= 3) {
      throw new BadRequestException('Too many verification requests. Please try again later.');
    }

    await this.emailVerificationService.createForUser(user.id);

    if (!currentCount) {
      await this.redisClient.set(rateLimitKey, '1', { EX: 3600 });
    } else {
      await this.redisClient.incr(rateLimitKey);
    }

    this.logger.log(`Resent verification email to: ${user.email}`);

    return { message: 'Verification email sent' };
  }

  /**
   * Password Reset Flow
   */
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: 'If an account exists, a reset link has been sent' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    user.passwordResetToken = hash;
    user.passwordResetExpiry = new Date(Date.now() + 3600 * 1000);

    await this.usersService.save(user);
    this.logger.log(`Password reset requested for: ${email}`);

    return { message: 'If an account exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.usersService['usersRepository'].findOne({
      where: {
        passwordResetToken: hash,
        passwordResetExpiry: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;

    await this.usersService.save(user);
    this.eventEmitter.emit('user.password.reset', { userId: user.id });

    await this.auditService.logAction(user.id, `Password reset completed for: ${user.email}`);

    return { message: 'Password reset successful' };
  }
}