import { Controller, Get, Param, UseGuards, Request, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { BadgeService } from './badge.service';
import { BadgeCountResponseDto, UserBadgesResponseDto } from './dto/badge.dto';

@ApiTags('badges')
@Controller(['badges', 'users/me/badges'])
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all available badges' })
  @ApiResponse({ status: 200, description: 'List of badges retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllBadges() {
    return this.badgeService.getAllBadges();
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get current user's earned badges" })
  @ApiResponse({ status: 200, description: 'User badges retrieved successfully', type: UserBadgesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyBadges(@Request() req: { user: { sub: string; id?: string } }): Promise<UserBadgesResponseDto> {
    const userId = req.user.sub ?? req.user.id;
    return this.badgeService.getMyBadges(userId);
  }

  @Get('count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the total number of badges earned by the current user' })
  @ApiResponse({
    status: 200,
    description: 'Badge count retrieved successfully',
    type: BadgeCountResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyBadgeCount(
    @Request() req: { user: { sub: string; id?: string } }
  ): Promise<BadgeCountResponseDto> {
    const userId = req.user.sub ?? req.user.id;
    return this.badgeService.getMyBadgeCount(userId);
  }

  @Get('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get a user's earned badges by ID" })
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiResponse({ status: 200, description: 'User badges retrieved successfully', type: UserBadgesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserBadges(@Param('userId') userId: string): Promise<UserBadgesResponseDto> {
    return this.badgeService.getMyBadges(userId);
  }
}
