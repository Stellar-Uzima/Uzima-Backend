import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { WalletSummaryDto } from './dto/wallet-summary.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Wallet')
@Controller('users/me/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user wallet summary' })
  @ApiResponse({
    status: 200,
    description: 'Wallet summary retrieved successfully',
    type: WalletSummaryDto,
  })
  async getSummary(@Request() req): Promise<WalletSummaryDto> {
    return this.walletService.getWalletSummary(req.user.sub);
  }
}
