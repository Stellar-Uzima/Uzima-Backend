import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { VerifyEmailDto, ResendEmailVerificationDto } from '../../auth/dto/verify-email.dto';
import { RefreshTokenDto } from '../../auth/dto/refresh-token.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() body: any) {
    // TODO: Implement user registration
    // - Validate input (email, phone, password)
    // - Hash password
    // - Create user in database
    // - Generate JWT token
    return { message: 'Registration logic to be implemented' };
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
  async login(@Body() body: any) {
    // TODO: Implement user login
    // - Validate credentials
    // - Generate JWT token
    // - Return token
    return { message: 'Login logic to be implemented' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh authentication token' })
  async refresh(@Body() body: any) {
    // TODO: Implement token refresh
    return { message: 'Refresh logic to be implemented' };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(@Req() req: any, @Body() dto: RefreshTokenDto) {
    const userId = req.user.sub;
    await this.authService.logout(userId, dto.refreshToken);
    return { message: 'User logged out successfully' };
  }
}
