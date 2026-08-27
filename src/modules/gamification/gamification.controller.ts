import { Controller, Get, Post, Body, Param, UseGuards, Request, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { AchievementService } from './achievement.service';
import { AwardXpDto, XpStatusDto } from './dto/xp-status.dto';

@ApiTags('Gamification')
@ApiBearerAuth()
@Controller('gamification')
export class GamificationController {
  constructor(
    private gamificationService: GamificationService,
    private achievementService: AchievementService,
  ) {}

  @Get('status/:userId')
  @ApiOperation({ summary: 'Get XP status for a user' })
  async getXpStatus(@Param('userId') userId: string): Promise<XpStatusDto> {
    return this.gamificationService.getUserXpStatus(userId);
  }

  @Post('award')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Award XP to a user' })
  async awardXp(@Body() awardXpDto: AwardXpDto): Promise<{
    xpStatus: XpStatusDto;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    return this.gamificationService.awardXp(awardXpDto);
  }

  @Get('transactions/:userId')
  @ApiOperation({ summary: 'Get XP transaction history for a user' })
  async getTransactions(@Param('userId') userId: string) {
    return this.gamificationService.getXpTransactions(userId);
  }

  @Get('achievements')
  @ApiOperation({ summary: 'Get all available achievements' })
  async getAllAchievements() {
    return this.gamificationService.getAchievements();
  }

  @Get('achievements/:userId')
  @ApiOperation({ summary: 'Get achievements earned by a user' })
  async getUserAchievements(@Param('userId') userId: string) {
    return this.gamificationService.getUserAchievements(userId);
  }

  @Post('achievements/check/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check and update achievements for a user' })
  async checkAchievements(@Param('userId') userId: string) {
    return this.achievementService.checkAchievements(userId);
  }

  @Post('achievements/unlock/:userId/:achievementKey')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Manually unlock an achievement for a user' })
  async unlockAchievement(
    @Param('userId') userId: string,
    @Param('achievementKey') achievementKey: string,
  ) {
    return this.achievementService.unlockAchievement(userId, achievementKey);
  }
}
