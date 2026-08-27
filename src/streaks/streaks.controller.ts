import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { StreaksService } from './streaks.service';

@ApiTags('Streaks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(['users/me/streak', 'streaks'])
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get()
  async getCurrentStreak(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.streaksService.getCurrentStreak(userId);
  }

  @Get('me')
  async getMyStreak(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    const streak = await this.streaksService.getCurrentStreak(userId);
    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActivityDate: streak.lastCompletedDate,
    };
  }

  @Get('history')
  async getHistory(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.streaksService.getStreakHistory(userId);
  }
}
