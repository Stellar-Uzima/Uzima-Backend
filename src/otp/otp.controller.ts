import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
  @ApiResponse({ status: 429, description: 'Too many OTP requests' })
  async requestOtp(@Body() body: OtpRequestDto) {
    return this.otpService.requestOtp(body.phoneNumber);
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
