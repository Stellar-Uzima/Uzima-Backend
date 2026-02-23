import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MoreThan } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OtpService } from '../otp/otp.service';
import { UsersService } from '../users/users.service';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

export interface OtpRequestResponse {
  success: boolean;
  message: string;
  remainingAttempts?: number;
  lockoutMinutes?: number;
}

export interface OtpVerificationResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  user?: {
    phoneNumber: string;
    isNewUser: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  /**
   * Request OTP for phone number login
   * POST /auth/phone/request-otp
   */
  async requestPhoneOtp(phoneLoginDto: PhoneLoginDto): Promise<OtpRequestResponse> {
    const { phoneNumber } = phoneLoginDto;

    this.logger.log(`OTP requested for phone: ${phoneNumber}`);

    const result = await this.otpService.requestOtp(phoneNumber);

    return {
      success: result.success,
      message: result.message,
      remainingAttempts: result.remainingAttempts,
      lockoutMinutes: result.lockoutMinutes,
    };
  }

  /**
   * Verify OTP and authenticate user
   * POST /auth/phone/verify-otp
   */
  async verifyPhoneOtp(verifyOtpDto: VerifyOtpDto): Promise<OtpVerificationResponse> {
    const { phoneNumber, otp } = verifyOtpDto;

    this.logger.log(`OTP verification attempted for phone: ${phoneNumber}`);

    const verificationResult = await this.otpService.verifyOtp(phoneNumber, otp);

    if (!verificationResult.success) {
      return {
        success: false,
        message: verificationResult.message,
      };
    }

    // OTP verified successfully - user is authenticated
    // In a real implementation, you would:
    // 1. Check if user exists in database
    // 2. Create new user if not exists
    // 3. Generate JWT access token
    // 4. Return token and user info

    // For now, we'll return a mock successful response
    // TODO: Implement actual user lookup/creation and JWT generation
    const isNewUser = true; // This should be determined by checking the database

    this.logger.log(`User authenticated successfully via phone: ${phoneNumber}`);

    return {
      success: true,
      message: 'Authentication successful',
      accessToken: 'mock-access-token', // TODO: Generate real JWT
      user: {
        phoneNumber,
        isNewUser,
      },
    };
  }

  /**
   * Verify user's email with token
   * POST /auth/email/verify
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const user = await this.usersService.userRepository.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiry: MoreThan(new Date()),
      },
    });

    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired verification token',
      };
    }

    user.isVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;

    await this.usersService.userRepository.save(user);

    this.eventEmitter.emit('user.email.verified', { userId: user.id, email: user.email });

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  /**
   * Resend verification email
   * POST /auth/email/resend
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Return success even if user not found for security (prevent email enumeration)
      return {
        success: true,
        message: 'If an account exists, a new verification email has been sent',
      };
    }

    if (user.isVerified) {
      return {
        success: false,
        message: 'Email is already verified',
      };
    }

    // Rate limiting: 3 per hour
    const rateLimitKey = `resend_email:${user.id}`;
    const count = await this.otpService['redis'].get(rateLimitKey);
    const currentCount = count ? parseInt(count, 10) : 0;

    if (currentCount >= 3) {
      return {
        success: false,
        message: 'Too many resend attempts. Please try again in an hour.',
      };
    }

    // Update rate limit counter
    await this.otpService['redis'].setex(rateLimitKey, 3600, (currentCount + 1).toString());

    // Generate new token and expiry
    user.emailVerificationToken = this.generateToken(32); // Mock UUID-like
    user.emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.usersService.userRepository.save(user);

    // TODO: Actually send the email
    this.logger.log(`Resent verification email to: ${email}`);

    return {
      success: true,
      message: 'Verification email resent successfully',
    };
  }

  /**
   * Handle forgot password request
   * POST /auth/password/forgot
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Return success for security
      return {
        success: true,
        message: 'If an account exists, a reset link has been sent to your email',
      };
    }

    const token = crypto.randomBytes(32).toString('hex'); // 64-char hex
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    user.passwordResetToken = hash;
    user.passwordResetExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

    await this.usersService.userRepository.save(user);

    // TODO: Send email with plain token
    this.logger.log(`Password reset token generated for: ${email}`);

    return {
      success: true,
      message: 'If an account exists, a reset link has been sent to your email',
    };
  }

  /**
   * Reset password with token
   * POST /auth/password/reset
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.usersService.userRepository.findOne({
      where: {
        passwordResetToken: hash,
        passwordResetExpiry: MoreThan(new Date()),
      },
    });

    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired reset token',
      };
    }

    // TODO: Compare with old password (requires bcrypt)
    // For now, simple update
    // In a real implementation:
    // const isSame = await bcrypt.compare(newPassword, user.passwordHash);
    // if (isSame) throw new BadRequestException('New password cannot be same as old');

    user.passwordHash = newPassword; // TODO: bcrypt.hash
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;

    await this.usersService.userRepository.save(user);

    this.eventEmitter.emit('user.password.reset', { userId: user.id });

    return {
      success: true,
      message: 'Password reset successful',
    };
  }

  private generateToken(length: number): string {
    return Math.random().toString(36).substring(2, 2 + length);
  }
}
