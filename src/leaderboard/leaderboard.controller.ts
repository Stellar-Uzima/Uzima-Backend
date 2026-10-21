import { Controller, Get, Query, Param, UseGuards, Req, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { LeaderboardResponseDto, UserRankResponseDto } from './dto/leaderboard.dto';
import { parseLeaderboardPeriod } from './leaderboard-period.enum';
import { Cache } from '../common/decorators/cache.decorator';
import { CACHE_TTL } from '../shared/cache/cache.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

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
  @Cache('leaderboard:global:limit:{limit}:page:{page}:period:{period}', CACHE_TTL.LEADERBOARD)
  @ApiOperation({
    summary: 'Get global leaderboard rankings',
    description: 'Retrieve the global leaderboard with optional limit and offset for pagination',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly', 'all-time'],
    example: 'weekly',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved leaderboard',
    type: LeaderboardResponseDto,
  })
  async getRanking(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('period') period?: string
  ): Promise<LeaderboardResponseDto> {
    return this.leaderboardService.getLeaderboard(
      req.user.id,
      limit || 10,
      undefined,
      page || 1,
      parseLeaderboardPeriod(period)
    );
  }

  /**
   * Get global leaderboard (alias for getRanking)
   */
  @Get('global')
  @Cache('leaderboard:global:limit:{limit}:page:{page}', CACHE_TTL.LEADERBOARD)
  @ApiOperation({
    summary: 'Get global leaderboard rankings',
    description: 'Retrieve the global leaderboard with caching optimization',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved global leaderboard',
    type: LeaderboardResponseDto,
  })
  async getGlobal(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
    @Query('page') page?: number
  ) {
    return this.leaderboardService.getLeaderboard(req.user.id, limit || 10, undefined, page || 1);
  }

  /**
   * Get the authenticated user's own rank without exposing restricted profile fields.
   *
   * Returns only: userId, displayName, rank, totalXlm, country, period.
   * No password hashes, refresh tokens, 2FA secrets, or other sensitive data.
   *
   * NOTE: This route must be declared before /country/:countryCode and any
   * other parameterised routes to prevent "me" being captured as a param value.
   */
  @Get('me/rank')
  @ApiOperation({
    summary: "Get the authenticated user's leaderboard rank",
    description:
      "Returns the current user's rank on the specified leaderboard. " +
      'Only safe, non-sensitive fields are included in the response — ' +
      'no password hashes, tokens, or restricted profile data are exposed.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly', 'all-time'],
    example: 'all-time',
    description: 'Leaderboard period to query',
  })
  @ApiQuery({
    name: 'countryCode',
    required: false,
    type: String,
    example: 'NG',
    description: 'Country code to scope the leaderboard; omit for global rank',
  })
  @ApiResponse({
    status: 200,
    description: "Successfully retrieved the user's rank",
    type: UserRankResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — valid JWT required' })
  async getMyRank(
    @Req() req: AuthenticatedRequest,
    @Query('period') period?: string,
    @Query('countryCode') countryCode?: string
  ): Promise<UserRankResponseDto> {
    return this.leaderboardService.getUserRank(
      req.user.id,
      countryCode,
      parseLeaderboardPeriod(period)
    );
  }

  /**
   * Get country-specific leaderboard
   */
  @Get('country/:countryCode')
  @Cache('leaderboard:country:{countryCode}:limit:{limit}:page:{page}', CACHE_TTL.LEADERBOARD)
  @ApiOperation({
    summary: 'Get leaderboard by country',
    description: 'Retrieve leaderboard rankings filtered by country code',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved country leaderboard',
    type: LeaderboardResponseDto,
  })
  async getByCountry(
    @Req() req: AuthenticatedRequest,
    @Param('countryCode') countryCode: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number
  ) {
    return this.leaderboardService.getLeaderboard(req.user.id, limit || 10, countryCode, page || 1);
  }
}
