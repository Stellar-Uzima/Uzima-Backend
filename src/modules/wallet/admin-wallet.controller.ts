import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';

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

  @Post(':userId/recover-transactions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recover missing wallet ledger entries and identify suspicious transactions',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet recovery report returned and missing entries restored for review',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async recoverTransactions(@Req() req: any, @Param('userId') userId: string) {
    return this.walletService.recoverTransactions(userId, req.user.sub);
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
    @Query('type') type?: string
  ) {
    return this.walletService.getTransactionHistory(
      userId,
      Number(page),
      Number(limit),
      startDate,
      endDate,
      type
    );
  }
}
