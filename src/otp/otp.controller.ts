import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Response } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response as ExpressResponse } from 'express';
import { OtpService } from './otp.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

class OtpRequestDto {
  phoneNumber: string;
}

class OtpVerifyDto {
  phoneNumber: string;
  otp: string;
}

@ApiTags('otp')
@Controller('otp')
@UseGuards(RateLimitGuard)
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @Throttle({ otp: { limit: 3, ttl: 3600000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP (strict rate limit)' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  @ApiResponse({ status: 429, description: 'Too many OTP requests or cooldown active' })
  async requestOtp(@Body() body: OtpRequestDto, @Response() res: ExpressResponse) {
    const result = await this.otpService.requestOtp(body.phoneNumber);

    // Handle resend cooldown with 429 status and Retry-After header
    if (!result.success && result.retryAfter) {
      return res
        .status(HttpStatus.TOO_MANY_REQUESTS)
        .set('Retry-After', result.retryAfter.toString())
        .json({
          success: false,
          message: result.message,
          retryAfter: result.retryAfter,
        });
    }

    return res.json(result);
  }

  @Post('verify')
  @Throttle({ otp: { limit: 5, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP (strict rate limit)' })
  @ApiResponse({ status: 200, description: 'OTP verified' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verifyOtp(@Body() body: OtpVerifyDto) {
    return this.otpService.verifyOtp(body.phoneNumber, body.otp);
  }
}
