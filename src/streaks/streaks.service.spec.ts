import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreaksService } from './streaks.service';
import { Streak } from './entities/streak.entity';
import { User } from '../users/entities/user.entity';

describe('StreaksService', () => {
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
  });

  describe('handleTaskCompleted', () => {
    it('should start a new streak if no previous tasks completed', async () => {
      const mockStreak = { user: { id: 'user-1' } } as any;
      mockStreakRepo.findOne.mockResolvedValue(mockStreak);

      const date = new Date('2024-03-01T12:00:00Z');
      jest.useFakeTimers().setSystemTime(date);

      await service.handleTaskCompleted({
        completionId: 'comp-1',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(1);
      expect(mockStreak.longestStreak).toBe(1);
      expect(mockStreak.lastCompletedDate).toBe('2024-03-01');
      expect(mockStreakRepo.save).toHaveBeenCalledWith(mockStreak);
    });

    it('should maintain current streak if already completed a task today', async () => {
      const date = new Date('2024-03-01T12:00:00Z');
      jest.useFakeTimers().setSystemTime(date);

      const mockStreak = {
        user: { id: 'user-1' },
        currentStreak: 2,
        longestStreak: 2,
        lastCompletedDate: '2024-03-01',
      } as any;

      mockStreakRepo.findOne.mockResolvedValue(mockStreak);

      await service.handleTaskCompleted({
        completionId: 'comp-2',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(2);
      expect(mockStreakRepo.save).not.toHaveBeenCalled();
    });

    it('should increment streak if completed yesterday', async () => {
      const mockStreak = {
        user: { id: 'user-1' },
        currentStreak: 6,
        longestStreak: 6,
        lastCompletedDate: '2024-02-28',
      } as any;
      mockStreakRepo.findOne.mockResolvedValue(mockStreak);

      const date = new Date('2024-02-29T12:00:00Z'); // Leap year for 29 days
      jest.useFakeTimers().setSystemTime(date);

      await service.handleTaskCompleted({
        completionId: 'comp-3',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(7);
      expect(mockStreak.longestStreak).toBe(7);
      expect(mockStreak.lastCompletedDate).toBe('2024-02-29');
      expect(mockStreakRepo.save).toHaveBeenCalledWith(mockStreak);
      expect(eventEmitter.emit).toHaveBeenCalledWith('streak.milestone', {
        userId: 'user-1',
        milestoneDays: 7,
      });
    });

    it('should reset streak if gap is greater than 1 day', async () => {
      const mockStreak = {
        user: { id: 'user-1' },
        currentStreak: 5,
        longestStreak: 5,
        lastCompletedDate: '2024-02-25',
      } as any;
      mockStreakRepo.findOne.mockResolvedValue(mockStreak);

      const date = new Date('2024-02-28T12:00:00Z');
      jest.useFakeTimers().setSystemTime(date);

      await service.handleTaskCompleted({
        completionId: 'comp-4',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 10,
      });

      expect(mockStreak.currentStreak).toBe(1);
      expect(mockStreak.longestStreak).toBe(5);
      expect(mockStreak.lastCompletedDate).toBe('2024-02-28');
      expect(mockStreakRepo.save).toHaveBeenCalledWith(mockStreak);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
