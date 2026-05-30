import { Controller, Get, Query, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardResponseDto } from './dto/leaderboard.dto';

@Controller('leaderboard')
@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * Get global leaderboard with optional pagination
   */
  @Get()
  @ApiOperation({
    summary: 'Get global leaderboard rankings',
    description: 'Retrieve the global leaderboard with optional limit and offset for pagination',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved leaderboard',
    type: LeaderboardResponseDto,
  })
  async getRanking(
    @Req() req,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ): Promise<LeaderboardResponseDto> {
    return this.leaderboardService.getLeaderboard(
      req.user.id,
      limit || 10,
      undefined,
      page || 1,
    );
  }

  /**
   * Get global leaderboard (alias for getRanking)
   */
  @Get('global')
  @ApiOperation({
    summary: 'Get global leaderboard rankings',
    description: 'Retrieve the global leaderboard with caching optimization',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved global leaderboard',
    type: LeaderboardResponseDto,
  })
  async getGlobal(@Req() req, @Query('limit') limit?: number) {
    return this.leaderboardService.getLeaderboard(req.user.id, limit || 50);
  }

  /**
   * Get country-specific leaderboard
   */
  @Get('country/:countryCode')
  @ApiOperation({
    summary: 'Get leaderboard by country',
    description: 'Retrieve leaderboard rankings filtered by country code',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved country leaderboard',
    type: LeaderboardResponseDto,
  })
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
