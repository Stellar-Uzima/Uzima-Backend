import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RewardService } from './reward.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { PayoutHistoryQueryDto } from './dto/payout-history-query.dto';

@ApiTags('Rewards')
@ApiBearerAuth()
@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get('payouts')
  @ApiOperation({ summary: 'Get XLM reward payout history' })
  @ApiResponse({ status: 200, description: 'Returns paginated payout records' })
  async getPayouts(
    @GetUser('id') userId: string,
    @Query() query: PayoutHistoryQueryDto,
  ) {
    return this.rewardService.getRewardHistory(userId, query);
  }
}