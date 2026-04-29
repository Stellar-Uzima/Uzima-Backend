import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { VerifyEmailDto, ResendEmailVerificationDto } from '../../auth/dto/verify-email.dto';
import { RefreshTokenDto } from '../../auth/dto/refresh-token.dto';
import { LoginDto } from '../../auth/dto/login.dto';
import { RegisterDto } from '../../auth/dto/register.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendEmailVerification(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
  async logout(@Req() req: any, @Body() dto: RefreshTokenDto) {
    const userId = req.user.sub;
    await this.authService.logout(userId, dto.refreshToken);
    return { message: 'User logged out successfully' };
  }
}
