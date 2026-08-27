import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { StreakMilestoneService } from './streak-milestone.service';

describe('StreakMilestoneService', () => {
  let service: StreakMilestoneService;
  let eventEmitter: EventEmitter2;

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreakMilestoneService,
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<StreakMilestoneService>(StreakMilestoneService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndEmit', () => {
    it('should emit event when streak crosses 7 day milestone', () => {
      service.checkAndEmit('user-1', 7);
      expect(eventEmitter.emit).toHaveBeenCalledWith('streak.milestone.reached', {
        userId: 'user-1',
        milestoneDays: 7,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('reward.milestone', {
        userId: 'user-1',
        milestoneReached: 7,
      });
    });

    it('should emit event when streak crosses 30 day milestone', () => {
      service.checkAndEmit('user-1', 30);
      expect(eventEmitter.emit).toHaveBeenCalledWith('streak.milestone.reached', {
        userId: 'user-1',
        milestoneDays: 30,
      });
    });

    it('should emit event when streak crosses 100 day milestone', () => {
      service.checkAndEmit('user-1', 100);
      expect(eventEmitter.emit).toHaveBeenCalledWith('streak.milestone.reached', {
        userId: 'user-1',
        milestoneDays: 100,
      });
    });

    it('should not emit duplicate events for already crossed milestones', () => {
      // First call - crosses 7 days
      service.checkAndEmit('user-1', 7);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2); // streak.milestone.reached + reward.milestone

      // Second call - still at 7 days (e.g., completed another task same day)
      service.checkAndEmit('user-1', 7);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2); // No new emissions

      // Third call - crossed to 8 days
      service.checkAndEmit('user-1', 8);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2); // Still no new emissions (only 7, 30, 100 are milestones)
    });

    it('should handle crossing multiple milestones at once', () => {
      // Simulate a user who jumped from 5 to 35 days (crossed both 7 and 30)
      service.checkAndEmit('user-1', 35);
      
      // Should emit for both 7 and 30
      expect(eventEmitter.emit).toHaveBeenCalledWith('streak.milestone.reached', {
        userId: 'user-1',
        milestoneDays: 7,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('streak.milestone.reached', {
        userId: 'user-1',
        milestoneDays: 30,
      });
      expect(eventEmitter.emit).toHaveBeenCalledTimes(4); // 2 milestones × 2 events each
    });

    it('should not emit for non-milestone values', () => {
      service.checkAndEmit('user-1', 5);
      service.checkAndEmit('user-1', 10);
      service.checkAndEmit('user-1', 50);
      
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should not emit for streak below milestone threshold', () => {
      service.checkAndEmit('user-1', 6);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle multiple users independently', () => {
      service.checkAndEmit('user-1', 7);
      service.checkAndEmit('user-2', 7);
      
      expect(eventEmitter.emit).toHaveBeenCalledTimes(4);
      expect(eventEmitter.emit).toHaveBeenNthCalledWith(1, 'streak.milestone.reached', {
        userId: 'user-1',
        milestoneDays: 7,
      });
      expect(eventEmitter.emit).toHaveBeenNthCalledWith(3, 'streak.milestone.reached', {
        userId: 'user-2',
        milestoneDays: 7,
      });
    });
  });

  describe('resetUserMilestones', () => {
    it('should reset milestone tracking for a user', () => {
      // Cross milestone
      service.checkAndEmit('user-1', 7);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);

      // Reset
      service.resetUserMilestones('user-1');

      // Should emit again after reset
      service.checkAndEmit('user-1', 7);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(4);
    });
  });

  describe('getUserReachedMilestones', () => {
    it('should return empty array for user with no milestones', () => {
      const milestones = service.getUserReachedMilestones('user-1');
      expect(milestones).toEqual([]);
    });

    it('should return reached milestones sorted', () => {
      service.checkAndEmit('user-1', 100); // Cross all milestones at once
      const milestones = service.getUserReachedMilestones('user-1');
      expect(milestones).toEqual([7, 30, 100]);
    });

    it('should return milestones in ascending order', () => {
      service.checkAndEmit('user-1', 30);
      service.checkAndEmit('user-1', 7); // Already crossed
      const milestones = service.getUserReachedMilestones('user-1');
      expect(milestones).toEqual([7, 30]);
    });
  });
});