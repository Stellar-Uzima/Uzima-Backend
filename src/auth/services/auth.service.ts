import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: RedisClientType;
  private readonly blacklistCache = new Map<string, { blacklisted: boolean; expiresAt: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

    const user = await this.usersService.create(dto);

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
    });

    // Create email verification token and send email
    if (user.email) {
      await this.emailVerificationService.createForUser(user.id);
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token };
  }

  // Login user
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new UnauthorizedException('Invalid credentials');

    // Check user status - prevent login for inactive or suspended users
    const loginCheck = await this.usersService.canUserLogin(user.id);
    if (!loginCheck.canLogin) {
      this.logger.warn(`Login attempt blocked for user ${user.id}: ${loginCheck.reason}`);
      throw new UnauthorizedException(loginCheck.reason || 'Account access denied');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    return this.generateTokens(user.id, user.email, user.role);
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
        this.eventEmitter.emit('auth.suspicious_activity', {
          userId,
          reason: 'Invalid or reused refresh token',
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Delete the used token
      await this.redisClient.del(key);

      const user = await this.usersService.findById(userId);
      return this.generateTokens(user.id, user.email, user.role);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const tokenId = crypto.randomUUID();

    const accessToken = this.jwtService.sign({ sub: userId, email, role }, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, role, tokenId },
      { expiresIn: '7d' }
    );

    const key = `refresh:${userId}:${tokenId}`;
    await this.redisClient.set(key, refreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    // Record session metadata in DB (device info can be passed later)
    try {
      await this.sessionService.createSession(userId, tokenId);
    } catch (err) {
      this.logger.warn('Failed to record session in DB', err as any);
    }

    return { accessToken, refreshToken };
  }

  // Logout with optimized transaction handling
  async logout(userId: string, refreshToken: string): Promise<void> {
    const startTime = Date.now();
    const contextId = `logout-${userId}-${Date.now()}`;

    try {
      this.logger.debug(`Starting logout for user ${userId}`);

      // Pre-validate token structure and ownership
      const payload = this.jwtService.verify(refreshToken);
      const { sub: tokenUserId, tokenId, exp } = payload;

      // Verify token ownership early
      if (tokenUserId !== userId) {
        this.logger.warn(`Token ownership mismatch for user ${userId}`);
        throw new UnauthorizedException('Refresh token does not belong to authenticated user');
      }

      // Check if token is already blacklisted (fast check)
      const isAlreadyBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isAlreadyBlacklisted) {
        this.logger.warn(`Attempted logout with already blacklisted token for user ${userId}`);
        // Still proceed with session cleanup for consistency
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
              expiresAt: new Date(exp * 1000),
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
          timeout: 5000, // 5 second timeout
        }
      );

      // Clean up Redis (outside transaction for performance)
      try {
        const redisKey = `refresh:${userId}:${tokenId}`;
        const redisDeleted = await this.redisClient.del(redisKey);
        if (redisDeleted > 0) {
          this.logger.debug(`Redis token cleaned up for user ${userId}`);
        }
      } catch (redisError) {
        // Redis failure shouldn't fail the logout
        this.logger.warn(`Redis cleanup failed for user ${userId}: ${redisError.message}`);
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

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Logout failed for user ${userId} after ${duration}ms: ${error.message}`, error.stack);

      // Re-throw with appropriate error type
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
    } catch (error) {
      this.logger.error(`Error checking token blacklist: ${error.message}`);
      // On database error, assume token is not blacklisted for safety
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

  /**
   * Clean up expired blacklisted tokens
   * Should be called periodically (e.g., via cron job)
   */
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
    } catch (error) {
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
        email: undefined, // No email for phone users
        password: undefined, // No password
      });
      this.logger.log(`New user registered via phone: ${verifyOtpDto.phoneNumber}`);
    }

    const tokens = await this.generateTokens(user.id, user.email || user.phoneNumber, user.role);
    return {
      success: true,
      message: 'Authentication successful',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
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

    const user = record.user;
    user.isVerified = true;
    // clear legacy fields if present
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;
    await this.usersService.save(user);

    // Emit email verified event
    this.eventEmitter.emit('user.email.verified', {
      userId: user.id,
      email: user.email,
    });

    // Audit log for email verification
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

    // Check rate limit (3 per hour)
    const rateLimitKey = `email_verify:${user.email}`;
    const currentCount = await this.redisClient.get(rateLimitKey);

    if (currentCount && parseInt(String(currentCount), 10) >= 3) {
      throw new BadRequestException('Too many verification requests. Please try again later.');
    }

  // Create a new email verification record and send email
  await this.emailVerificationService.createForUser(user.id);

    // Increment rate limit counter
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
      // Success for security
      return { message: 'If an account exists, a reset link has been sent' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    user.passwordResetToken = hash;
    user.passwordResetExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

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

    // Audit log for password reset
    await this.auditService.logAction(user.id, `Password reset completed for: ${user.email}`);

    return { message: 'Password reset successful' };
  }
}
