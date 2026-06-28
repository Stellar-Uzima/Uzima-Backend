import { Controller, Post, Get, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
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

  @Post(':userId/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync user wallet balance from Stellar network' })
  @ApiResponse({ status: 200, description: 'Live balance synced and cached locally' })
  async syncBalance(@Param('userId') userId: string) {
    return this.walletService.syncBalance(userId);
  }

  @Get(':userId/transactions')
  @ApiOperation({ summary: 'Get wallet transaction history for a user' })
  @ApiResponse({
    status: 200,
    description: 'Transaction history retrieved successfully',
  })
  async getTransactions(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    return this.walletService.getTransactionHistory(
      userId,
      Number(page),
      Number(limit),
      startDate,
      endDate,
      type,
    );
  }
}
