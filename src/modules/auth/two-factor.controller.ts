import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { TwoFactorService } from './services/two-factor.service';
import { TwoFactorCodeDto, TwoFactorBackupDto } from './dto/two-factor.dto';

@ApiTags('Authentication')
@ApiBearerAuth()
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post('setup')
  @ApiOperation({ summary: 'Setup two-factor authentication for the current user' })
  @ApiResponse({ status: 200, description: '2FA setup data returned' })
  async setup(@Req() req: any) {
    return this.twoFactorService.setupTwoFactor(req.user.sub);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm and enable two-factor authentication' })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
  async confirm(@Req() req: any, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactorService.confirmTwoFactor(req.user.sub, dto.code);
  }

  @Post('disable')
  @ApiOperation({ summary: 'Disable two-factor authentication' })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  async disable(@Req() req: any, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactorService.disableTwoFactor(req.user.sub, dto.code);
  }

  @Post('recover')
  @ApiOperation({ summary: 'Recover access using a backup code' })
  @ApiResponse({ status: 200, description: 'Backup code verified successfully' })
  async recover(@Req() req: any, @Body() dto: TwoFactorBackupDto) {
    return this.twoFactorService.verifyBackupCode(req.user.sub, dto.backupCode);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get two-factor authentication status' })
  @ApiResponse({ status: 200, description: '2FA status returned' })
  async status(@Req() req: any) {
    return this.twoFactorService.getStatus(req.user.sub);
  }
}
