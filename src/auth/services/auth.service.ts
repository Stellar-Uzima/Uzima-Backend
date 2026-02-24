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
import { MoreThan } from 'typeorm';
import { createClient, RedisClientType } from 'redis';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { Role } from '../enums/role.enum';
import { UsersService } from './users.service';
import { OtpService } from '../../otp/otp.service';
import { PhoneLoginDto } from '../dto/phone-login.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { VerifyEmailDto, ResendEmailVerificationDto } from '../dto/verify-email.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: RedisClientType;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
    private otpService: OtpService,
  ) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect();
  }

  // Register user
  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) throw new ConflictException('Email already exists');

    const user = await this.usersService.create(dto);

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
    });

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token };
  }

  // Login user
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches)
      throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, user.email, user.role);
  }

  // Refresh access token
  async refresh(userId: string, oldRefreshToken: string) {
    const storedToken = await this.redisClient.get(`refresh:${userId}`);
    if (!storedToken || storedToken !== oldRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.redisClient.del(`refresh:${userId}`);

    const user = await this.usersService.findById(userId);
    return this.generateTokens(user.id, user.email, user.role);
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role },
      { expiresIn: '15m' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, role },
      { expiresIn: '7d' },
    );

    await this.redisClient.set(`refresh:${userId}`, refreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    return { accessToken, refreshToken };
  }

  // Logout
  async logout(userId: string) {
    await this.redisClient.del(`refresh:${userId}`);
  }

  /**
   * Phone OTP Flow
   */
  async requestPhoneOtp(phoneLoginDto: PhoneLoginDto) {
    return this.otpService.requestOtp(phoneLoginDto.phoneNumber);
  }

  async verifyPhoneOtp(verifyOtpDto: VerifyOtpDto) {
    const verificationResult = await this.otpService.verifyOtp(verifyOtpDto.phoneNumber, verifyOtpDto.otp);
    if (!verificationResult.success) {
      throw new UnauthorizedException(verificationResult.message);
    }

    let user = await this.usersService.findByPhoneNumber(verifyOtpDto.phoneNumber);
    const isNewUser = !user;

    if (isNewUser) {
      // In a real implementation, you might want to redirect to a completion profile page
      this.logger.log(`New user registered via phone: ${verifyOtpDto.phoneNumber}`);
      // Minimal user creation or return info to client
    }

    // Mock response matching previous implementation but integrated
    return {
      success: true,
      message: 'Authentication successful',
      accessToken: 'mock-access-token', // TODO: Generate real JWT if user exists
      user: {
        phoneNumber: verifyOtpDto.phoneNumber,
        isNewUser,
      },
    };
  }

  // Verify email
  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.usersService['usersRepository'].findOne({
      where: {
        emailVerificationToken: dto.token,
        emailVerificationExpiry: MoreThan(new Date()),
      }
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // Clear verification token and mark email as verified
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;
    user.isVerified = true;

    await this.usersService.save(user);

    // Emit email verified event
    this.eventEmitter.emit('user.email.verified', {
      userId: user.id,
      email: user.email,
    });

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

    if (currentCount && parseInt(currentCount) >= 3) {
      throw new BadRequestException(
        'Too many verification requests. Please try again later.',
      );
    }

    // Generate new verification token (using UUID for consistency with remote)
    const verificationToken = crypto.randomUUID();
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + 24); // 24-hour expiry

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpiry = expiryTime;

    await this.usersService.save(user);

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
    user.passwordHash = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;

    await this.usersService.save(user);
    this.eventEmitter.emit('user.password.reset', { userId: user.id });

    return { message: 'Password reset successful' };
  }
}
