import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreaksService } from './streaks.service';
import { Streak } from './entities/streak.entity';
import { User } from '../entities/user.entity';

describe('StreaksService & Day-Boundary Edge Cases (Issue #1061)', () => {
  let service: StreaksService;
  let eventEmitter: EventEmitter2;

  const mockStreakRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreaksService,
        {
          provide: getRepositoryToken(Streak),
          useValue: mockStreakRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<StreaksService>(StreaksService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Day Boundary & Exact-Miss Edge Cases', () => {
    it('should correctly increment streak when completed just before vs just after midnight boundary', async () => {
      const mockStreak = {
        user: { id: 'user-1' },
        currentStreak: 1,
        longestStreak: 1,
        lastCompletedDate: '2026-07-28',
      } as any;
      mockStreakRepo.findOne.mockResolvedValue(mockStreak);

      // Task completed at 23:59:59 UTC on 2026-07-29 (next consecutive day)
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T23:59:59Z'));

      await service.handleTaskCompleted({
        completionId: 'comp-edge-1',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(2);
      expect(mockStreak.lastCompletedDate).toBe('2026-07-29');

      // Subsequent task completed 2 seconds later at 00:00:01 UTC on 2026-07-30 (next day)
      jest.useFakeTimers().setSystemTime(new Date('2026-07-30T00:00:01Z'));

      await service.handleTaskCompleted({
        completionId: 'comp-edge-2',
        userId: 'user-1',
        taskId: 'task-2',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(3);
      expect(mockStreak.lastCompletedDate).toBe('2026-07-30');
    });

    it('should reset streak to 1 when exactly one day is missed (diffDays === 2)', async () => {
      const mockStreak = {
        user: { id: 'user-1' },
        currentStreak: 10,
        longestStreak: 10,
        lastCompletedDate: '2026-07-27',
      } as any;
      mockStreakRepo.findOne.mockResolvedValue(mockStreak);

      // Completed on 2026-07-27, missed 2026-07-28 completely, task done on 2026-07-29
      jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00Z'));

      await service.handleTaskCompleted({
        completionId: 'comp-miss-1',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(1);
      expect(mockStreak.longestStreak).toBe(10); // Longest streak preserved
      expect(mockStreak.lastCompletedDate).toBe('2026-07-29');
      expect(mockStreakRepo.save).toHaveBeenCalledWith(mockStreak);
    });
  });

  describe('handleUserRegistered', () => {
    it('should create a default streak for a new user', async () => {
      const mockUser = { id: 'user-1' };
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockStreakRepo.create.mockReturnValue({
        user: mockUser,
        currentStreak: 0,
        longestStreak: 0,
      });

      await service.handleUserRegistered({
        userId: 'user-1',
        email: 'test@example.com',
      });

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(mockStreakRepo.create).toHaveBeenCalledWith({
        user: mockUser,
        currentStreak: 0,
        longestStreak: 0,
      });
      expect(mockStreakRepo.save).toHaveBeenCalled();
    });

    it('should not create a streak if user is not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await service.handleUserRegistered({
        userId: 'nonexistent-user',
        email: 'ghost@example.com',
      });

      expect(mockStreakRepo.create).not.toHaveBeenCalled();
      expect(mockStreakRepo.save).not.toHaveBeenCalled();
    });
  });
});
