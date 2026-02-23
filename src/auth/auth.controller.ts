import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService, OtpRequestResponse, OtpVerificationResponse } from './auth.service';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('phone/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP for phone authentication',
    description: 'Send a 6-digit OTP to the provided phone number. Rate limited to 3 requests per hour per phone number.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully',
        remainingAttempts: 2,
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded or phone locked',
    schema: {
      example: {
        success: false,
        message: 'Maximum OTP requests exceeded. Please try again later.',
        remainingAttempts: 0,
        lockoutMinutes: 45,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid phone number format',
  })
  async requestOtp(@Body() phoneLoginDto: PhoneLoginDto): Promise<OtpRequestResponse> {
    return this.authService.requestPhoneOtp(phoneLoginDto);
  }

  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and authenticate user',
    description: 'Verify the 6-digit OTP sent to the phone number. 3 failed attempts will lock the phone for 30 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        success: true,
        message: 'Authentication successful',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          phoneNumber: '+2348012345678',
          isNewUser: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid OTP',
    schema: {
      example: {
        success: false,
        message: 'Invalid OTP. 2 attempt(s) remaining.',
      },
    },
  })
  @ApiResponse({
    status: 423,
    description: 'Phone locked due to too many failed attempts',
    schema: {
      example: {
        success: false,
        message: 'Too many failed attempts. Phone number is locked for 30 minutes.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<OtpVerificationResponse> {
    return this.authService.verifyPhoneOtp(verifyOtpDto);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify user email' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto): Promise<{ success: boolean; message: string }> {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  async resendVerification(@Body('email') email: string): Promise<{ success: boolean; message: string }> {
    return this.authService.resendVerificationEmail(email);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto): Promise<{ success: boolean; message: string }> {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<{ success: boolean; message: string }> {
    return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.password);
  }
}
