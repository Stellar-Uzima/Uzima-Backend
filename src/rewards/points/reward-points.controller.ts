import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RewardPointRule } from './entities/reward-point-rule.entity';
import { RewardPointsLedger } from './entities/reward-points-ledger.entity';
import { ListLedgerQueryDto } from './dto/list-ledger-query.dto';
import { RedeemPointsDto } from './dto/redeem-points.dto';
import {
  PointsRedemptionResult,
  RewardPointsService,
} from './reward-points.service';

@ApiTags('Reward Points')
@ApiBearerAuth()
@Controller()
export class RewardPointsController {
  constructor(private readonly rewardPointsService: RewardPointsService) {}

  @Get('reward-points/rules')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List active reward point rules',
    description:
      'Returns the currently active point rules (action keys and point values) that govern reward accrual.',
  })
  @ApiResponse({ status: 200, description: 'Active point rules', type: [RewardPointRule] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listRules(): Promise<RewardPointRule[]> {
    return this.rewardPointsService.listActiveRules();
  }

  @Get('reward-points/balance')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get the authenticated user point balance',
    description: 'Balance is derived from the append-only points ledger.',
  })
  @ApiResponse({ status: 200, description: 'Current balance' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBalance(
    @Req() req: any,
  ): Promise<{ userId: string; balance: number }> {
    const userId = req.user.userId ?? req.user.sub;
    return this.rewardPointsService.getBalance(userId);
  }

  @Get('reward-points/ledger')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get the authenticated user points ledger history',
    description:
      'Paginated, newest-first list of point awards and deductions for the requesting user.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated ledger entries' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getLedger(
    @Req() req: any,
    @Query() query: ListLedgerQueryDto,
  ): Promise<{
    data: RewardPointsLedger[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const userId = req.user.userId ?? req.user.sub;
    return this.rewardPointsService.getLedger(
      userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post('rewards/points/redeem')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem a CREDITS reward catalog item with reward points',
    description:
      'Validates reward availability and point balance, then deducts points and records the claim atomically. Duplicate concurrent claims cannot double-settle.',
  })
  @ApiResponse({
    status: 200,
    description: 'Redemption summary',
    type: Object,
  })
  @ApiResponse({ status: 400, description: 'Insufficient points or reward unavailable' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Catalog item not found' })
  async redeem(
    @Req() req: any,
    @Body() dto: RedeemPointsDto,
  ): Promise<PointsRedemptionResult> {
    const userId = req.user.userId ?? req.user.sub;
    return this.rewardPointsService.redeemPoints(userId, dto.catalogItemId);
  }
}
