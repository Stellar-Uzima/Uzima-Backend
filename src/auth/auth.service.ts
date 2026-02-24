import { Injectable, Logger } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
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

  constructor(private readonly otpService: OtpService) {}

  /**
   * Request OTP for phone number login
   * POST /auth/phone/request-otp
   */
  async requestPhoneOtp(
    phoneLoginDto: PhoneLoginDto,
  ): Promise<OtpRequestResponse> {
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
  async verifyPhoneOtp(
    verifyOtpDto: VerifyOtpDto,
  ): Promise<OtpVerificationResponse> {
    const { phoneNumber, otp } = verifyOtpDto;

    this.logger.log(`OTP verification attempted for phone: ${phoneNumber}`);

    const verificationResult = await this.otpService.verifyOtp(
      phoneNumber,
      otp,
    );

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

    this.logger.log(
      `User authenticated successfully via phone: ${phoneNumber}`,
    );

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
}
