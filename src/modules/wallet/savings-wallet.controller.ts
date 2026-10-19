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
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { Role } from '../../modules/auth/enums/role.enum';
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
import {
  ReverseTransactionDto,
  ReverseTransactionResponseDto,
} from './dto/wallet-transaction.dto';

@ApiTags('Savings & Wallet')
@ApiBearerAuth()
@Controller('users/me')
export class SavingsWalletController {
  constructor(
    private readonly savingsService: SavingsService,
    private readonly transactionService: WalletTransactionService,
  ) {}

  /**
   * The JWT strategy populates `req.user.userId`; some legacy paths use
   * `sub`. Resolve defensively so every endpoint is correctly user-scoped.
   */
  private resolveUserId(req: any): string {
    return req.user?.userId ?? req.user?.sub;
  }

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
    return this.savingsService.createGoal(this.resolveUserId(req), dto);
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
    return this.savingsService.getGoals(this.resolveUserId(req), query);
  }

  @Get('savings/summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get overall savings summary' })
  @ApiResponse({ status: 200, description: 'Savings summary with totals and next milestone' })
  async getSavingsSummary(@Req() req: any) {
    return this.savingsService.getSavingsSummary(this.resolveUserId(req));
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
    return this.savingsService.getGoalById(this.resolveUserId(req), id);
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
    return this.savingsService.updateGoal(this.resolveUserId(req), id, dto);
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
    return this.savingsService.deleteGoal(this.resolveUserId(req), id);
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
    return this.savingsService.contribute(this.resolveUserId(req), id, dto);
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
    return this.savingsService.getContributions(this.resolveUserId(req), id);
  }

  // ========== Wallet Transactions ==========

  @Get('wallet/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get wallet transaction history with filters, pagination and stable ordering' })
  @ApiQuery({ name: 'type', enum: ['DEPOSIT', 'WITHDRAWAL', 'REWARD', 'TRANSFER_IN', 'TRANSFER_OUT', 'SAVINGS_CONTRIBUTION', 'SAVINGS_WITHDRAWAL', 'CONSULTATION_PAYMENT', 'REFUND', 'FEE'], required: false })
  @ApiQuery({ name: 'status', enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED'], required: false })
  @ApiQuery({ name: 'startDate', type: String, required: false, example: '2024-01-01T00:00:00.000Z' })
  @ApiQuery({ name: 'endDate', type: String, required: false, example: '2024-12-31T23:59:59.999Z' })
  @ApiQuery({ name: 'sort', enum: ['ASC', 'DESC'], required: false, description: 'createdAt sort direction (default DESC); id tie-break keeps ordering stable' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  async getTransactions(
    @Req() req: any,
    @Query() query: WalletTransactionListQueryDto,
  ) {
    return this.transactionService.getTransactions(this.resolveUserId(req), query);
  }

  @Get('wallet/transactions/stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get transaction statistics' })
  @ApiResponse({ status: 200, description: 'Transaction stats' })
  async getTransactionStats(@Req() req: any) {
    return this.transactionService.getTransactionStats(this.resolveUserId(req));
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
    return this.transactionService.getTransactionById(this.resolveUserId(req), id);
  }

  @Post('wallet/transactions/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending wallet transaction owned by the caller' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction cancelled', type: WalletTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Transaction is not pending or already terminal' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async cancelTransaction(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<WalletTransactionResponseDto> {
    return this.transactionService.cancelTransaction(this.resolveUserId(req), id);
  }

  @Post('wallet/transactions/:id/reverse')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a settled wallet transaction via a compensating ledger entry (admin only)' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction reversed', type: ReverseTransactionResponseDto })
  @ApiResponse({ status: 400, description: 'Transaction is not eligible for reversal, already reversed, or insufficient balance' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async reverseTransaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReverseTransactionDto,
  ): Promise<ReverseTransactionResponseDto> {
    return this.transactionService.reverseTransaction(id, {
      reversedByUserId: this.resolveUserId(req),
      reversedByRole: req.user?.role,
      reason: dto.reason,
    });
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
    return this.transactionService.topUp(this.resolveUserId(req), dto);
  }
}