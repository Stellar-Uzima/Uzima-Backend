import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StreaksService } from './streaks.service';

@ApiTags('Streaks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/streak')
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  /**
   * Get current streak data for the authenticated user.
   * Returns current streak count, longest streak, and last activity date.
   */
  @Get()
  @ApiOperation({
    summary: 'Get current user streak',
    description: 'Retrieve the current streak data including count, longest streak, and last activity for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Streak data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        currentStreak: { type: 'number', example: 7, description: 'Current consecutive days' },
        longestStreak: { type: 'number', example: 30, description: 'Longest streak ever' },
        lastCompletedDate: { type: 'string', example: '2026-03-29', description: 'Last activity date (YYYY-MM-DD)' },
        milestoneNext: { type: 'number', example: 10, description: 'Next milestone days threshold' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentStreak(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.streaksService.getCurrentStreak(userId);
  }

  /**
   * Get streak history for the authenticated user.
   * Returns an array of daily streak records.
   */
  @Get('history')
  @ApiOperation({
    summary: 'Get user streak history',
    description: 'Retrieve the full streak history showing daily activity records for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Streak history retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', example: '2026-03-29' },
          completed: { type: 'boolean', example: true },
          streakCount: { type: 'number', example: 7 },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHistory(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.streaksService.getStreakHistory(userId);
  }
}
