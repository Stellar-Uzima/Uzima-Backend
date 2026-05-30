import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { VerifyEmailDto, ResendEmailVerificationDto } from '../../auth/dto/verify-email.dto';
import { RefreshTokenDto } from '../../auth/dto/refresh-token.dto';
import { LoginDto } from '../../auth/dto/login.dto';
import { RegisterDto } from '../../auth/dto/register.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { TwoFactorEnableDto, TwoFactorDisableDto } from './dto/two-factor-enable.dto';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a user email address',
    description:
      'Confirms a user account using the verification token previously emailed to the user.',
  })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification token' })
  @ApiResponse({ status: 404, description: 'Verification token not found' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the email verification message',
    description:
      'Issues a fresh verification token and re-sends it to the user-supplied email address.',
  })
  @ApiResponse({ status: 200, description: 'Verification email re-sent' })
  @ApiResponse({ status: 400, description: 'Email already verified or invalid request' })
  @ApiResponse({ status: 404, description: 'No account found for the supplied email' })
  async resendVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendEmailVerification(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 423, description: 'Account temporarily locked' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enable two-factor authentication',
    description:
      'Issues an authenticator-compatible secret and QR code for the caller, after verifying a TOTP challenge code.',
  })
  @ApiResponse({ status: 200, description: 'Returns QR code and secret for authenticator setup' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP code supplied' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async enableTwoFactor(@Req() req: { user: { sub: string } }, @Body() dto: TwoFactorEnableDto) {
    return this.authService.enableTwoFactor(req.user.sub, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable two-factor authentication',
    description:
      'Removes the caller\'s TOTP configuration after they successfully verify a current authenticator code.',
  })
  @ApiResponse({ status: 200, description: '2FA disabled after verification' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP code supplied' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async disableTwoFactor(@Req() req: { user: { sub: string } }, @Body() dto: TwoFactorDisableDto) {
    return this.authService.disableTwoFactor(req.user.sub, dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh authentication token' })
  @ApiResponse({ status: 200, description: 'New access and refresh tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async logout(@Req() req: { user: { sub: string } }, @Body() dto: RefreshTokenDto) {
    const userId = req.user.sub;
    await this.authService.logout(dto.refreshToken);
    return { message: 'User logged out successfully' };
  }
}
