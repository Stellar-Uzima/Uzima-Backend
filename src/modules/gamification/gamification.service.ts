import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserXP } from './entities/user-xp.entity';
import { XpTransaction, XpEventType } from './entities/xp-transaction.entity';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { AwardXpDto, LevelUpEventDto, XpStatusDto } from './dto/xp-status.dto';
import { LeaderboardService } from '../../leaderboard/leaderboard.service';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);
  private readonly levelMultiplier = 100;
  private readonly levelExponent = 2;

  constructor(
    @InjectRepository(UserXP)
    private userXpRepo: Repository<UserXP>,
    @InjectRepository(XpTransaction)
    private xpTransactionRepo: Repository<XpTransaction>,
    @InjectRepository(Achievement)
    private achievementRepo: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private userAchievementRepo: Repository<UserAchievement>,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => LeaderboardService))
    private leaderboardService: LeaderboardService,
  ) {}

  private calculateLevel(xp: number): number {
    return Math.floor(Math.pow(xp / this.levelMultiplier, 1 / this.levelExponent));
  }

  private calculateXpForLevel(level: number): number {
    return this.levelMultiplier * Math.pow(level, this.levelExponent);
  }

  private calculateXpForNextLevel(currentLevel: number): number {
    return this.calculateXpForLevel(currentLevel + 1);
  }

  async getUserXpStatus(userId: string): Promise<XpStatusDto> {
    let userXp = await this.userXpRepo.findOne({ where: { userId } });
    
    if (!userXp) {
      userXp = this.userXpRepo.create({
        userId,
        totalXp: 0,
        currentLevel: 0,
        xpTowardNextLevel: 0,
        xpForNextLevel: this.calculateXpForLevel(1),
      });
    }

    const xpForNextLevel = this.calculateXpForLevel(userXp.currentLevel + 1);
    const progressPercentage = xpForNextLevel > 0 
      ? (userXp.xpTowardNextLevel / xpForNextLevel) * 100 
      : 0;

    return {
      userId: userXp.userId,
      totalXp: userXp.totalXp,
      currentLevel: userXp.currentLevel,
      xpTowardNextLevel: userXp.xpTowardNextLevel,
      xpForNextLevel: xpForNextLevel,
      progressPercentage: Math.min(progressPercentage, 100),
    };
  }

  async awardXp(awardXpDto: AwardXpDto): Promise<{
    xpStatus: XpStatusDto;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    const { userId, amount, reason, sourceEvent, metadata } = awardXpDto;
    
    this.logger.log(Awarding  XP to user  for );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let userXp = await queryRunner.manager.findOne(UserXP, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!userXp) {
        userXp = queryRunner.manager.create(UserXP, {
          userId,
          totalXp: 0,
          currentLevel: 0,
          xpTowardNextLevel: 0,
          xpForNextLevel: this.calculateXpForLevel(1),
        });
        await queryRunner.manager.save(userXp);
      }

      const oldLevel = userXp.currentLevel;
      
      userXp.totalXp += amount;
      userXp.xpTowardNextLevel += amount;
      userXp.xpForNextLevel = this.calculateXpForLevel(userXp.currentLevel + 1);

      let leveledUp = false;
      let newLevel = userXp.currentLevel;

      while (userXp.xpTowardNextLevel >= userXp.xpForNextLevel) {
        userXp.currentLevel += 1;
        userXp.xpTowardNextLevel -= userXp.xpForNextLevel;
        userXp.xpForNextLevel = this.calculateXpForLevel(userXp.currentLevel + 1);
        leveledUp = true;
        newLevel = userXp.currentLevel;
      }

      await queryRunner.manager.save(userXp);

      const transaction = queryRunner.manager.create(XpTransaction, {
        userId,
        amount,
        reason,
        sourceEvent: sourceEvent as XpEventType,
        metadata,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      if (leveledUp) {
        const levelUpEvent: LevelUpEventDto = {
          userId,
          newLevel,
          xpEarned: amount,
          totalXp: userXp.totalXp,
        };
        this.eventEmitter.emit('level-up', levelUpEvent);
        this.logger.log(User  leveled up to level !);
      }

      await this.leaderboardService.rebuildLeaderboards();

      const xpStatus = await this.getUserXpStatus(userId);

      return {
        xpStatus,
        leveledUp,
        newLevel: leveledUp ? newLevel : undefined,
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(Failed to award XP: );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getXpTransactions(userId: string, limit: number = 10): Promise<XpTransaction[]> {
    return this.xpTransactionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getAchievements(): Promise<Achievement[]> {
    return this.achievementRepo.find();
  }

  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    return this.userAchievementRepo.find({
      where: { userId },
      relations: ['achievement'],
      order: { unlockedAt: 'DESC' },
    });
  }

  async seedDefaultAchievements(): Promise<void> {
    const achievements = [
      {
        key: 'task_master',
        name: 'Task Master',
        description: 'Complete 10 tasks in one day',
        unlockCondition: { type: 'tasks_in_day', target: 10 },
        xpReward: 100,
        icon: '🏆',
      },
      {
        key: 'consistent',
        name: 'Consistent Champion',
        description: 'Maintain a 7-day streak',
        unlockCondition: { type: 'streak_days', target: 7 },
        xpReward: 75,
        icon: '🔥',
      },
      {
        key: 'explorer',
        name: 'Explorer',
        description: 'Earn XP in 5 different categories',
        unlockCondition: { type: 'categories_xp', target: 5 },
        xpReward: 50,
        icon: '🗺️',
      },
      {
        key: 'rising_star',
        name: 'Rising Star',
        description: 'Reach level 5',
        unlockCondition: { type: 'level', target: 5 },
        xpReward: 150,
        icon: '⭐',
      },
      {
        key: 'night_owl',
        name: 'Night Owl',
        description: 'Complete a task between midnight and 5am',
        unlockCondition: { type: 'night_task', target: 1 },
        xpReward: 60,
        icon: '🌙',
      },
    ];

    for (const achievementData of achievements) {
      const exists = await this.achievementRepo.findOne({
        where: { key: achievementData.key },
      });
      
      if (!exists) {
        const achievement = this.achievementRepo.create(achievementData);
        await this.achievementRepo.save(achievement);
        this.logger.log(Seeded achievement: );
      }
    }
  }
}
