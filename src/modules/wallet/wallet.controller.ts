import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { WalletSummaryDto } from './dto/wallet-summary.dto';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CreateWithdrawalDto, WithdrawalListQueryDto, WithdrawalStatus } from './dto/withdrawal.dto';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';

@ApiTags('Wallet')
@Controller('users/me/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user wallet address and balance' })
  @ApiResponse({
    status: 200,
    description: 'Wallet address and balance returned',
  })
  @ApiResponse({
    status: 404,
    description: 'No wallet linked',
  })
  async getWallet(@Request() req) {
    const summary = await this.walletService.getWalletSummary(req.user.sub);
    if (!summary.walletLinked) {
      return { walletAddress: null, xlmBalance: null };
    }
    return {
      walletAddress: summary.walletAddress,
      xlmBalance: summary.liveBalance,
    };
  }

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

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link Stellar wallet address' })
  @ApiResponse({
    status: 200,
    description: 'Wallet address linked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid address format or account not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Address already linked to another account',
  })
  async linkWallet(
    @Request() req,
    @Body() linkWalletDto: LinkWalletDto,
  ): Promise<{ message: string }> {
    await this.walletService.linkWallet(req.user.sub, linkWalletDto.address);
    return { message: 'Wallet linked successfully' };
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiResponse({
    status: 200,
    description: 'Transaction history retrieved successfully',
  })
  async getTransactions(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    return this.walletService.getTransactionHistory(
      req.user.sub,
      Number(page),
      Number(limit),
      startDate,
      endDate,
      type,
    );
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a withdrawal request' })
  @ApiResponse({ status: 200, description: 'Withdrawal request created', type: WithdrawalResponseDto })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid address' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'No wallet linked' })
  async createWithdrawal(
    @Request() req,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<WithdrawalResponseDto> {
    return this.walletService.createWithdrawal(req.user.sub, dto);
  }

  @Get('withdrawals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get withdrawal history' })
  @ApiResponse({ status: 200, description: 'Withdrawal history retrieved' })
  async getWithdrawals(
    @Request() req,
    @Query() query: WithdrawalListQueryDto,
  ) {
    return this.walletService.getWithdrawals(req.user.sub, query);
  }

  @Get('withdrawals/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get withdrawal by ID' })
  @ApiResponse({ status: 200, description: 'Withdrawal retrieved', type: WithdrawalResponseDto })
  @ApiResponse({ status: 404, description: 'Withdrawal not found' })
  async getWithdrawalById(
    @Request() req,
    @Param('id') id: string,
  ): Promise<WithdrawalResponseDto> {
    return this.walletService.getWithdrawalById(req.user.sub, id);
  }
}
