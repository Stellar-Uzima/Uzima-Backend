import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { StreaksService } from './streaks.service';

@ApiTags('Streaks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(['users/me/streak', 'streaks'])
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get()
  @ApiOperation({ summary: 'Get current streak for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Current streak retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentStreak(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.streaksService.getCurrentStreak(userId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my streak summary' })
  @ApiResponse({ status: 200, description: 'Streak summary retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({ summary: 'Get streak history for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Streak history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHistory(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.streaksService.getStreakHistory(userId);
  }
}
