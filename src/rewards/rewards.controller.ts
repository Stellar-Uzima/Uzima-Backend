import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import RewardsService from './rewards.service';
import JwtAuthGuard from 'modules/auth/guards/jwt-auth.guard';
import { GetPayoutHistoryDto, PaginatedPayoutHistoryDto } from './dto/payout-history.dto';

@ApiTags('rewards')
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('payouts')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Paginated payout history returned successfully',
    type: PaginatedPayoutHistoryDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPayoutHistory(
    @Req() req,
    @Query() query: GetPayoutHistoryDto
  ): Promise<PaginatedPayoutHistoryDto> {
    return this.rewardsService.getPayoutHistory(req.user.id, query);
  }
}
