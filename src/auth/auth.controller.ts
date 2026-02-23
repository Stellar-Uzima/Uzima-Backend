// src/auth/auth.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './services/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { UsersService } from './services/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  async refresh(@Body() body: { userId: string; refreshToken: string }) {
    const { userId, refreshToken } = body;
    return this.authService.refresh(userId, refreshToken);
  }

  @Post('me/wallet')
  @UseGuards(JwtAuthGuard)
  async linkWallet(@Req() req, @Body() dto: LinkWalletDto) {
    const userId = req.user.sub; // from JWT
    const updatedUser = await this.usersService.linkWallet(userId, dto);
    return updatedUser;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any) {
    const userId = req.user.sub;
    await this.authService.logout(userId);
    return { message: 'Logged out successfully' };
  }
}
