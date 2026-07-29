import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GamificationService } from './gamification.service';
import { AchievementService } from './achievement.service';
import { GamificationController } from './gamification.controller';
import { UserXP } from './entities/user-xp.entity';
import { XpTransaction } from './entities/xp-transaction.entity';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { LeaderboardModule } from '../../leaderboard/leaderboard.module';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserXP,
      XpTransaction,
      Achievement,
      UserAchievement,
      User,
    ]),
    forwardRef(() => LeaderboardModule),
    EventEmitterModule.forRoot(),
  ],
  controllers: [GamificationController],
  providers: [GamificationService, AchievementService],
  exports: [GamificationService, AchievementService],
})
export class GamificationModule {}
