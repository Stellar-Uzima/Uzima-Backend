import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { BadgeService } from './badge.service';
import { Badge } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';
import { User } from '../../database/entities/user.entity';
import { Streak } from '../../streaks/entities/streak.entity';
import { TaskCompletion } from '../../task-completion/entities/task-completion.entity';
import { BadgeType } from './enums/badge-type.enum';

describe('BadgeService', () => {
  let service: BadgeService;

  const mockBadgeRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const mockUserBadgeRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockStreakRepository = {
    findOne: jest.fn(),
  };

  const mockTaskCompletionRepository = {
    count: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        {
          provide: getRepositoryToken(Badge),
          useValue: mockBadgeRepository,
        },
        {
          provide: getRepositoryToken(UserBadge),
          useValue: mockUserBadgeRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Streak),
          useValue: mockStreakRepository,
        },
        {
          provide: getRepositoryToken(TaskCompletion),
          useValue: mockTaskCompletionRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<BadgeService>(BadgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeBadges', () => {
    it('should initialize default badges if none exist', async () => {
      mockBadgeRepository.count.mockResolvedValue(0);
      mockBadgeRepository.create.mockImplementation((data) => data);
      mockBadgeRepository.save.mockResolvedValue({});

      await service.initializeBadges();

      expect(mockBadgeRepository.count).toHaveBeenCalled();
      expect(mockBadgeRepository.create).toHaveBeenCalledTimes(5);
      expect(mockBadgeRepository.save).toHaveBeenCalledTimes(5);
    });

    it('should not initialize badges if they already exist', async () => {
      mockBadgeRepository.count.mockResolvedValue(5);

      await service.initializeBadges();

      expect(mockBadgeRepository.count).toHaveBeenCalled();
      expect(mockBadgeRepository.create).not.toHaveBeenCalled();
    });

    it('should create all badge types correctly', async () => {
      mockBadgeRepository.count.mockResolvedValue(0);
      mockBadgeRepository.create.mockImplementation((data) => data);
      mockBadgeRepository.save.mockResolvedValue({});

      await service.initializeBadges();

      const createCalls = mockBadgeRepository.create.mock.calls;
      expect(createCalls[0][0].type).toBe(BadgeType.FIRST_TASK);
      expect(createCalls[1][0].type).toBe(BadgeType.STREAK_7_DAYS);
      expect(createCalls[2][0].type).toBe(BadgeType.STREAK_30_DAYS);
      expect(createCalls[3][0].type).toBe(BadgeType.STREAK_100_DAYS);
      expect(createCalls[4][0].type).toBe(BadgeType.HEALTH_CHAMPION);
    });
  });

  describe('awardBadgeToUser', () => {
    const userId = 'user-123';
    const badgeId = 'badge-456';

    it('should award a badge to a user', async () => {
      const mockUser = { id: userId, email: 'test@example.com' };
      const mockBadge = {
        id: badgeId,
        name: 'First Step',
        type: BadgeType.FIRST_TASK,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockBadgeRepository.findOne.mockResolvedValue(mockBadge);
      mockUserBadgeRepository.findOne.mockResolvedValue(null);
      mockUserBadgeRepository.create.mockReturnValue({
        userId,
        badgeId,
        user: mockUser,
        badge: mockBadge,
      });
      mockUserBadgeRepository.save.mockResolvedValue({
        id: 'ub-123',
        userId,
        badgeId,
        awardedAt: new Date(),
      });

      const result = await service.awardBadgeToUser(userId, badgeId);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockBadgeRepository.findOne).toHaveBeenCalledWith({
        where: { id: badgeId },
      });
      expect(mockUserBadgeRepository.findOne).toHaveBeenCalledWith({
        where: { userId, badgeId },
      });
      expect(mockUserBadgeRepository.create).toHaveBeenCalled();
      expect(mockUserBadgeRepository.save).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('badge.awarded', {
        userId,
        badgeId,
        badgeName: 'First Step',
      });
    });

    it('should return existing badge if already awarded', async () => {
      const mockUser = { id: userId };
      const mockBadge = { id: badgeId, name: 'First Step' };
      const existingUserBadge = { id: 'ub-123', userId, badgeId };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockBadgeRepository.findOne.mockResolvedValue(mockBadge);
      mockUserBadgeRepository.findOne.mockResolvedValue(existingUserBadge);

      const result = await service.awardBadgeToUser(userId, badgeId);

      expect(result).toEqual(existingUserBadge);
      expect(mockUserBadgeRepository.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.awardBadgeToUser(userId, badgeId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if badge not found', async () => {
      const mockUser = { id: userId };
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockBadgeRepository.findOne.mockResolvedValue(null);

      await expect(service.awardBadgeToUser(userId, badgeId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllBadges', () => {
    it('should return all active badges', async () => {
      const mockBadges = [
        {
          id: 'badge-1',
          name: 'First Step',
          type: BadgeType.FIRST_TASK,
          description: 'Complete your first task',
          milestone: 1,
          milestoneType: 'task_completion',
          icon: '🎯',
          isActive: true,
        },
        {
          id: 'badge-2',
          name: 'Week Warrior',
          type: BadgeType.STREAK_7_DAYS,
          description: 'Maintain a 7-day streak',
          milestone: 7,
          milestoneType: 'streak_days',
          icon: '🔥',
          isActive: true,
        },
      ];

      mockBadgeRepository.find.mockResolvedValue(mockBadges);

      const result = await service.getAllBadges();

      expect(mockBadgeRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(result.badges).toHaveLength(2);
      expect(result.totalBadges).toBe(2);
      expect(result.badges[0].name).toBe('First Step');
    });

    it('should return empty list if no badges exist', async () => {
      mockBadgeRepository.find.mockResolvedValue([]);

      const result = await service.getAllBadges();

      expect(result.badges).toHaveLength(0);
      expect(result.totalBadges).toBe(0);
    });
  });

  describe('getUserBadges', () => {
    const userId = 'user-123';

    it('should return badges earned by user', async () => {
      const mockUser = { id: userId };
      const mockUserBadges = [
        {
          id: 'ub-1',
          userId,
          badge: {
            id: 'badge-1',
            name: 'First Step',
            type: BadgeType.FIRST_TASK,
            description: 'Complete your first task',
            icon: '🎯',
            milestone: 1,
          },
          awardedAt: new Date('2024-01-01'),
        },
      ];

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserBadgeRepository.find.mockResolvedValue(mockUserBadges);

      const result = await service.getUserBadges(userId);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockUserBadgeRepository.find).toHaveBeenCalledWith({
        where: { userId },
        relations: ['badge'],
        order: { awardedAt: 'DESC' },
      });
      expect(result.userId).toBe(userId);
      expect(result.badges).toHaveLength(1);
      expect(result.totalBadges).toBe(1);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserBadges(userId)).rejects.toThrow(NotFoundException);
    });

    it('should return empty badges for new user', async () => {
      const mockUser = { id: userId };
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserBadgeRepository.find.mockResolvedValue([]);

      const result = await service.getUserBadges(userId);

      expect(result.badges).toHaveLength(0);
      expect(result.totalBadges).toBe(0);
    });
  });

  describe('checkAndAwardBadges', () => {
    const userId = 'user-123';

    it('should check and award badges for user', async () => {
      const mockUser = { id: userId };
      const mockBadges = [
        {
          id: 'badge-1',
          type: BadgeType.FIRST_TASK,
          milestone: 1,
          milestoneType: 'task_completion',
          isActive: true,
          name: 'First Step',
        },
      ];

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockBadgeRepository.find.mockResolvedValue(mockBadges);
      mockUserBadgeRepository.findOne.mockResolvedValue(null);
      mockTaskCompletionRepository.count.mockResolvedValue(1);
      jest.spyOn(service, 'awardBadgeToUser').mockResolvedValue({} as any);

      await service.checkAndAwardBadges(userId);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockBadgeRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    it('should not award already earned badges', async () => {
      const mockUser = { id: userId };
      const mockBadges = [
        {
          id: 'badge-1',
          type: BadgeType.FIRST_TASK,
          isActive: true,
        },
      ];

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockBadgeRepository.find.mockResolvedValue(mockBadges);
      mockUserBadgeRepository.findOne.mockResolvedValue({ id: 'ub-1' });

      jest.spyOn(service, 'awardBadgeToUser').mockResolvedValue({} as any);

      await service.checkAndAwardBadges(userId);

      expect(service.awardBadgeToUser).not.toHaveBeenCalled();
    });

    it('should handle user not found gracefully', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await service.checkAndAwardBadges(userId);

      expect(mockBadgeRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('userHasEarnedBadge', () => {
    const userId = 'user-123';
    const badgeId = 'badge-456';

    it('should return true if user has earned badge', async () => {
      mockUserBadgeRepository.findOne.mockResolvedValue({ id: 'ub-123' });

      const result = await service.userHasEarnedBadge(userId, badgeId);

      expect(result).toBe(true);
      expect(mockUserBadgeRepository.findOne).toHaveBeenCalledWith({
        where: { userId, badgeId },
      });
    });

    it('should return false if user has not earned badge', async () => {
      mockUserBadgeRepository.findOne.mockResolvedValue(null);

      const result = await service.userHasEarnedBadge(userId, badgeId);

      expect(result).toBe(false);
    });
  });

  describe('checkTaskCompletionMilestone', () => {
    const userId = 'user-123';

    it('should return true if user has completed required tasks', async () => {
      mockTaskCompletionRepository.count.mockResolvedValue(5);

      const result = await (service as any).checkTaskCompletionMilestone(userId, 5);

      expect(result).toBe(true);
      expect(mockTaskCompletionRepository.count).toHaveBeenCalledWith({
        where: { userId, isCompleted: true },
      });
    });

    it('should return false if user has not completed enough tasks', async () => {
      mockTaskCompletionRepository.count.mockResolvedValue(3);

      const result = await (service as any).checkTaskCompletionMilestone(userId, 5);

      expect(result).toBe(false);
    });
  });

  describe('checkStreakMilestone', () => {
    const userId = 'user-123';

    it('should return true if user has achieved required streak', async () => {
      mockStreakRepository.findOne.mockResolvedValue({
        currentStreak: 30,
      });

      const result = await (service as any).checkStreakMilestone(userId, 30);

      expect(result).toBe(true);
      expect(mockStreakRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: userId } },
      });
    });

    it('should return false if user has not achieved required streak', async () => {
      mockStreakRepository.findOne.mockResolvedValue({
        currentStreak: 15,
      });

      const result = await (service as any).checkStreakMilestone(userId, 30);

      expect(result).toBe(false);
    });

    it('should return false if user has no streak', async () => {
      mockStreakRepository.findOne.mockResolvedValue(null);

      const result = await (service as any).checkStreakMilestone(userId, 30);

      expect(result).toBe(false);
    });
  });

  describe('getBadgeById', () => {
    const badgeId = 'badge-123';

    it('should return badge by id', async () => {
      const mockBadge = {
        id: badgeId,
        name: 'First Step',
        type: BadgeType.FIRST_TASK,
        description: 'Complete your first task',
        icon: '🎯',
        milestone: 1,
        milestoneType: 'task_completion',
        isActive: true,
      };

      mockBadgeRepository.findOne.mockResolvedValue(mockBadge);

      const result = await service.getBadgeById(badgeId);

      expect(result.name).toBe('First Step');
      expect(result.type).toBe(BadgeType.FIRST_TASK);
    });

    it('should throw NotFoundException if badge not found', async () => {
      mockBadgeRepository.findOne.mockResolvedValue(null);

      await expect(service.getBadgeById(badgeId)).rejects.toThrow(NotFoundException);
    });
  });
});
