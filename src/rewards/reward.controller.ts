import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RewardService } from './reward.service';
import {
  RewardHistoryQueryDto,
  RewardHistoryResponseDto,
} from './dto/reward-history.dto';

@ApiTags('rewards')
@Controller('rewards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  /** Call to re-check XLM total and emit reward.milestone if thresholds (10, 25, 50, 100, 250) are reached; coupon service will create coupons. Use for testing or after recording rewards. */
  @Post('check-milestone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check milestone and create coupons if thresholds reached',
    description:
      'Sums completed XLM for the current user and emits reward.milestone for each threshold (10, 25, 50, 100, 250). The coupon service listens and creates up to 5 active coupons per user.',
  })
  @ApiResponse({ status: 200, description: 'Milestone check completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkMilestone(@Request() req: { user: { sub: string; id?: string } }) {
    const userId = req.user.sub ?? req.user.id;
    await this.rewardService.emitMilestoneIfReached(userId);
    return {
      message:
        'Milestone check completed. Check GET /coupons/me for new coupons.',
    };
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user reward history',
    description:
      'Retrieve paginated list of XLM rewards earned from health tasks with optional filtering by date range and category',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination', type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page', type: Number, example: 20 })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter start date (ISO 8601 format)', type: String, example: '2026-03-01T00:00:00Z' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter end date (ISO 8601 format)', type: String, example: '2026-03-31T23:59:59Z' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by health task category ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Reward history retrieved successfully',
    type: RewardHistoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRewardHistory(
    @Request() req: any,
    @Query() queryDto: RewardHistoryQueryDto,
  ): Promise<RewardHistoryResponseDto> {
    const userId = req.user.id;
    return this.rewardService.getRewardHistory(userId, queryDto);
  }
}
