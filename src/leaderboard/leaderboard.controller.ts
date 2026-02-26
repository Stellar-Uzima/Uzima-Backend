import { Controller, Get, Query, Param, UseGuards, Req } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('global')
  async getGlobal(@Req() req, @Query('limit') limit?: number) {
    return this.leaderboardService.getLeaderboard(req.user.id, limit || 50);
  }

  @Get('country/:countryCode')
  async getByCountry(
    @Req() req,
    @Param('countryCode') countryCode: string,
    @Query('limit') limit?: number,
  ) {
    return this.leaderboardService.getLeaderboard(
      req.user.id,
      limit || 50,
      countryCode,
    );
  }
}
