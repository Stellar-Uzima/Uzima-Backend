import { Controller, Get, Post, Body, Param, UseGuards, Request, HttpStatus, HttpCode } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { AchievementService } from './achievement.service';
import { AwardXpDto, XpStatusDto } from './dto/xp-status.dto';

@Controller('gamification')
export class GamificationController {
  constructor(
    private gamificationService: GamificationService,
    private achievementService: AchievementService,
  ) {}

  @Get('status/:userId')
  async getXpStatus(@Param('userId') userId: string): Promise<XpStatusDto> {
    return this.gamificationService.getUserXpStatus(userId);
  }

  @Post('award')
  @HttpCode(HttpStatus.OK)
  async awardXp(@Body() awardXpDto: AwardXpDto): Promise<{
    xpStatus: XpStatusDto;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    return this.gamificationService.awardXp(awardXpDto);
  }

  @Get('transactions/:userId')
  async getTransactions(@Param('userId') userId: string) {
    return this.gamificationService.getXpTransactions(userId);
  }

  @Get('achievements')
  async getAllAchievements() {
    return this.gamificationService.getAchievements();
  }

  @Get('achievements/:userId')
  async getUserAchievements(@Param('userId') userId: string) {
    return this.gamificationService.getUserAchievements(userId);
  }

  @Post('achievements/check/:userId')
  @HttpCode(HttpStatus.OK)
  async checkAchievements(@Param('userId') userId: string) {
    return this.achievementService.checkAchievements(userId);
  }

  @Post('achievements/unlock/:userId/:achievementKey')
  @HttpCode(HttpStatus.CREATED)
  async unlockAchievement(
    @Param('userId') userId: string,
    @Param('achievementKey') achievementKey: string,
  ) {
    return this.achievementService.unlockAchievement(userId, achievementKey);
  }
}
