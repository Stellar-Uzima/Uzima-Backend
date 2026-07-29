import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { GamificationService } from './gamification.service';
import { User } from '../../database/entities/user.entity';
import { XpTransaction, XpEventType } from './entities/xp-transaction.entity';
import { UserXP } from './entities/user-xp.entity';

@Injectable()
export class AchievementService {
  private readonly logger = new Logger(AchievementService.name);

  constructor(
    @InjectRepository(Achievement)
    private achievementRepo: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private userAchievementRepo: Repository<UserAchievement>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(XpTransaction)
    private xpTransactionRepo: Repository<XpTransaction>,
    @InjectRepository(UserXP)
    private userXpRepo: Repository<UserXP>,
    private gamificationService: GamificationService,
  ) {}

  async checkAchievements(userId: string): Promise<UserAchievement[]> {
    const unlockedAchievements = await this.userAchievementRepo.find({
      where: { userId },
      select: ['achievementId'],
    });
    
    const unlockedIds = unlockedAchievements.map(ua => ua.achievementId);
    
    const allAchievements = await this.achievementRepo.find();
    const eligibleAchievements = allAchievements.filter(
      a => !unlockedIds.includes(a.id)
    );

    if (eligibleAchievements.length === 0) {
      return [];
    }

    const newlyUnlocked = [];
    
    for (const achievement of eligibleAchievements) {
      const isUnlocked = await this.evaluateCondition(userId, achievement);
      if (isUnlocked) {
        const userAchievement = this.userAchievementRepo.create({
          userId,
          achievementId: achievement.id,
          unlockedAt: new Date(),
        });
        await this.userAchievementRepo.save(userAchievement);
        newlyUnlocked.push(userAchievement);
        
        await this.gamificationService.awardXp({
          userId,
          amount: achievement.xpReward,
          reason: Unlocked achievement: ,
          sourceEvent: XpEventType.ACHIEVEMENT_UNLOCKED,
          metadata: { achievementKey: achievement.key },
        });
        
        this.logger.log(User  unlocked achievement: );
      }
    }
    
    return newlyUnlocked;
  }

  private async evaluateCondition(userId: string, achievement: Achievement): Promise<boolean> {
    const condition = achievement.unlockCondition;
    const { type, target } = condition;

    switch (type) {
      case 'tasks_in_day':
        return this.checkTasksInDay(userId, target);
      case 'streak_days':
        return this.checkStreakDays(userId, target);
      case 'categories_xp':
        return this.checkCategoriesXp(userId, target);
      case 'level':
        return this.checkLevel(userId, target);
      case 'night_task':
        return this.checkNightTask(userId, target);
      default:
        this.logger.warn(Unknown achievement condition type: );
        return false;
    }
  }

  private async checkTasksInDay(userId: string, target: number): Promise<boolean> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await this.xpTransactionRepo.count({
      where: {
        userId,
        sourceEvent: XpEventType.TASK_COMPLETED,
        createdAt: Between(startOfDay, endOfDay),
      },
    });

    return count >= target;
  }

  private async checkStreakDays(userId: string, target: number): Promise<boolean> {
    const streakResult = await this.userRepo
      .createQueryBuilder('u')
      .select('s.current_streak', 'streak')
      .innerJoin('u.streaks', 's')
      .where('u.id = :userId', { userId })
      .getRawOne();

    return streakResult && streakResult.streak >= target;
  }

  private async checkCategoriesXp(userId: string, target: number): Promise<boolean> {
    const transactions = await this.xpTransactionRepo.find({
      where: { userId },
    });

    const categories = new Set();
    for (const tx of transactions) {
      if (tx.metadata && tx.metadata.category) {
        categories.add(tx.metadata.category);
      }
    }

    return categories.size >= target;
  }

  private async checkLevel(userId: string, target: number): Promise<boolean> {
    const userXp = await this.userXpRepo.findOne({ where: { userId } });
    if (!userXp) return false;
    return userXp.currentLevel >= target;
  }

  private async checkNightTask(userId: string, target: number): Promise<boolean> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const fiveAm = new Date();
    fiveAm.setHours(5, 0, 0, 0);

    const count = await this.xpTransactionRepo.count({
      where: {
        userId,
        sourceEvent: XpEventType.TASK_COMPLETED,
        createdAt: Between(midnight, fiveAm),
      },
    });

    return count >= target;
  }

  async unlockAchievement(userId: string, achievementKey: string): Promise<UserAchievement> {
    const achievement = await this.achievementRepo.findOne({
      where: { key: achievementKey },
    });

    if (!achievement) {
      throw new Error(Achievement with key  not found);
    }

    const existing = await this.userAchievementRepo.findOne({
      where: {
        userId,
        achievementId: achievement.id,
      },
    });

    if (existing) {
      throw new Error('Achievement already unlocked');
    }

    const userAchievement = this.userAchievementRepo.create({
      userId,
      achievementId: achievement.id,
      unlockedAt: new Date(),
    });

    await this.userAchievementRepo.save(userAchievement);

    await this.gamificationService.awardXp({
      userId,
      amount: achievement.xpReward,
      reason: Unlocked achievement: ,
      sourceEvent: XpEventType.ACHIEVEMENT_UNLOCKED,
      metadata: { achievementKey },
    });

    return userAchievement;
  }
}
