import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { SavingsService } from './savings.service';
import { WalletTransactionService } from './wallet-transaction.service';
import {
  CreateSavingsGoalDto,
  UpdateSavingsGoalDto,
  CreateContributionDto,
  SavingsGoalListQueryDto,
  WalletTransactionListQueryDto,
  TopUpDto,
  TopUpResponseDto,
  SavingsGoalResponseDto,
  ContributionResponseDto,
  WalletTransactionResponseDto,
} from './dto/savings-wallet.dto';

@ApiTags('Savings & Wallet')
@ApiBearerAuth()
@Controller('users/me')
export class SavingsWalletController {
  constructor(
    private readonly savingsService: SavingsService,
    private readonly transactionService: WalletTransactionService,
  ) {}

  // ========== Savings Goals ==========

  @Post('savings/goals')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new savings goal' })
  @ApiResponse({ status: 201, description: 'Savings goal created', type: SavingsGoalResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or wallet not linked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createGoal(
    @Req() req: any,
    @Body() dto: CreateSavingsGoalDto,
  ): Promise<SavingsGoalResponseDto> {
    return this.savingsService.createGoal(req.user.sub, dto);
  }

  @Get('savings/goals')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List user savings goals with pagination' })
  @ApiQuery({ name: 'status', enum: ['ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED'], required: false })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Savings goals retrieved' })
  async getGoals(
    @Req() req: any,
    @Query() query: SavingsGoalListQueryDto,
  ) {
    return this.savingsService.getGoals(req.user.sub, query);
  }

  @Get('savings/summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get overall savings summary' })
  @ApiResponse({ status: 200, description: 'Savings summary with totals and next milestone' })
  async getSavingsSummary(@Req() req: any) {
    return this.savingsService.getSavingsSummary(req.user.sub);
  }

  @Get('savings/goals/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a savings goal by ID' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiResponse({ status: 200, description: 'Savings goal retrieved', type: SavingsGoalResponseDto })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  async getGoalById(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<SavingsGoalResponseDto> {
    return this.savingsService.getGoalById(req.user.sub, id);
  }

  @Put('savings/goals/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a savings goal' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiResponse({ status: 200, description: 'Savings goal updated', type: SavingsGoalResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  async updateGoal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSavingsGoalDto,
  ): Promise<SavingsGoalResponseDto> {
    return this.savingsService.updateGoal(req.user.sub, id, dto);
  }

  @Delete('savings/goals/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel/Delete a savings goal' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiResponse({ status: 204, description: 'Goal cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot delete completed goal or goal with pending contributions' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  async deleteGoal(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<void> {
    return this.savingsService.deleteGoal(req.user.sub, id);
  }

  @Post('savings/goals/:id/contribute')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Contribute to a savings goal' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiResponse({ status: 200, description: 'Contribution processed', type: ContributionResponseDto })
  @ApiResponse({ status: 400, description: 'Insufficient balance or would exceed target' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  async contribute(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateContributionDto,
  ): Promise<ContributionResponseDto> {
    return this.savingsService.contribute(req.user.sub, id, dto);
  }

  @Get('savings/goals/:id/contributions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get contributions for a savings goal' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiResponse({ status: 200, description: 'Contributions retrieved', type: [ContributionResponseDto] })
  async getContributions(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<ContributionResponseDto[]> {
    return this.savingsService.getContributions(req.user.sub, id);
  }

  // ========== Wallet Transactions ==========

  @Get('wallet/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get wallet transaction history with filters and pagination' })
  @ApiQuery({ name: 'type', enum: ['DEPOSIT', 'WITHDRAWAL', 'REWARD', 'TRANSFER_IN', 'TRANSFER_OUT', 'SAVINGS_CONTRIBUTION', 'SAVINGS_WITHDRAWAL', 'CONSULTATION_PAYMENT', 'REFUND', 'FEE'], required: false })
  @ApiQuery({ name: 'status', enum: ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'], required: false })
  @ApiQuery({ name: 'startDate', type: String, required: false, example: '2024-01-01T00:00:00.000Z' })
  @ApiQuery({ name: 'endDate', type: String, required: false, example: '2024-12-31T23:59:59.999Z' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  async getTransactions(
    @Req() req: any,
    @Query() query: WalletTransactionListQueryDto,
  ) {
    return this.transactionService.getTransactions(req.user.sub, query);
  }

  @Get('wallet/transactions/stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get transaction statistics' })
  @ApiResponse({ status: 200, description: 'Transaction stats' })
  async getTransactionStats(@Req() req: any) {
    return this.transactionService.getTransactionStats(req.user.sub);
  }

  @Get('wallet/transactions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction retrieved', type: WalletTransactionResponseDto })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionById(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<WalletTransactionResponseDto> {
    return this.transactionService.getTransactionById(req.user.sub, id);
  }

  // ========== Top-up ==========

  @Post('wallet/topup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate wallet top-up' })
  @ApiResponse({ status: 200, description: 'Top-up initiated', type: TopUpResponseDto })
  @ApiResponse({ status: 400, description: 'Wallet not linked' })
  async topUp(
    @Req() req: any,
    @Body() dto: TopUpDto,
  ): Promise<TopUpResponseDto> {
    return this.transactionService.topUp(req.user.sub, dto);
  }
}