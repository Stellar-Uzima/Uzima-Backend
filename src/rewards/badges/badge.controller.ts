import { Controller, Get, Param, UseGuards, Request, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { BadgeService } from './badge.service';
import { BadgeListResponseDto, UserBadgesResponseDto } from './dto/badge.dto';
import { Badge } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';

@ApiTags('badges')
@Controller(['badges', 'users/me/badges'])
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all available badges',
    description: 'Retrieve a list of all available badges in the system',
  })
  @ApiResponse({
    status: 200,
    description: 'List of badges retrieved successfully',
    type: BadgeListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllBadges(): Promise<Badge[]> {
    return this.badgeService.getAllBadges();
  }

  @Get('count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get current user's earned badge count",
    description:
      'Returns the total number of badges earned by the authenticated user using a COUNT query.',
  })
  @ApiResponse({
    status: 200,
    description: 'Badge count retrieved successfully',
    schema: { example: { count: 3 } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUserBadgeCount(
    @Request() req: { user: { sub?: string; id?: string; userId?: string } },
  ): Promise<{ count: number }> {
    const userId = req.user.sub ?? req.user.id ?? req.user.userId;
    return this.badgeService.getUserBadgeCount(userId);
  }

  @Get('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get user's earned badges",
    description: 'Retrieve all badges earned by a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'The UUID of the user',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'User badges retrieved successfully',
    type: UserBadgesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserBadges(@Param('userId') userId: string): Promise<UserBadge[]> {
    return this.badgeService.getUserBadges(userId);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get current user's earned badges",
    description: 'Retrieve all badges earned by the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'User badges retrieved successfully',
    type: UserBadgesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUserBadges(
    @Request() req: { user: { sub?: string; id?: string; userId?: string } },
  ): Promise<UserBadge[]> {
    const userId = req.user.sub ?? req.user.id ?? req.user.userId;
    return this.badgeService.getUserBadges(userId);
  }
}
