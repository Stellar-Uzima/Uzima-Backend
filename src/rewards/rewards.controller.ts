import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetPayoutHistoryDto, PaginatedPayoutHistoryDto } from './dto/payout-history.dto';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('payouts')
  @UseGuards(JwtAuthGuard)
  async getPayoutHistory(
    @Req() req,
    @Query() query: GetPayoutHistoryDto,
  ): Promise<PaginatedPayoutHistoryDto> {
    return this.rewardsService.getPayoutHistory(req.user.id, query);
  }
}
