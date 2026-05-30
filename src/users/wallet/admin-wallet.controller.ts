import { Controller, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller('wallets')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post(':userId/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile a user wallet' })
  @ApiResponse({ status: 200, description: 'Reconciliation summary returned' })
  async reconcile(@Param('userId') userId: string) {
    return this.walletService.reconcile(userId);
  }
}
