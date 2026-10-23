import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RewardService } from './reward.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RewardHistoryQueryDto } from './dto/reward-history.dto';
import { RewardSummaryResponseDto } from './dto/reward-history.dto';
import { Request } from 'express';

type AuthenticatedRequest = Request & {
  user?: {
    userId?: unknown;
    sub?: unknown;
    id?: unknown;
  };
};

@ApiTags('Rewards')
@ApiBearerAuth()
@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  private authenticatedUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (typeof userId !== 'string' || !userId) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    return userId;
  }

  @Get(['history', 'payouts'])
  @ApiOperation({ summary: "Get the authenticated user's reward history" })
  @ApiResponse({ status: 200, description: 'Returns paginated reward records' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHistory(@Req() req: AuthenticatedRequest, @Query() query: RewardHistoryQueryDto) {
    return this.rewardService.getRewardHistory(this.authenticatedUserId(req), query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get reward summary for authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Returns total earned, total pending and last reward date',
    type: RewardSummaryResponseDto,
  })
  async getSummary(@Req() req: AuthenticatedRequest): Promise<RewardSummaryResponseDto> {
    return this.rewardService.getRewardSummary(this.authenticatedUserId(req));
  }
}
