import { Test, TestingModule } from '@nestjs/testing';
 feat/all-issues-anna
import { BadgeService } from './badge.service';
import { BadgeType } from './badge-type.enum';

describe('BadgeService', () => {
  let service: BadgeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BadgeService],
    }).compile();

    service = module.get<BadgeService>(BadgeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('awardBadge', () => {
    it('should award a badge to a user successfully', () => {
      const result = service.awardBadge('user-1', BadgeType.STREAK_7);
      expect(result).toBe(true);
      expect(service.hasBadge('user-1', BadgeType.STREAK_7)).toBe(true);
    });

    it('should return false when awarding the same badge twice (no duplicate)', () => {
      // First award
      const firstResult = service.awardBadge('user-1', BadgeType.STREAK_7);
      expect(firstResult).toBe(true);

      // Second award - must NOT duplicate
      const secondResult = service.awardBadge('user-1', BadgeType.STREAK_7);
      expect(secondResult).toBe(false);

      // User should still have only one entry for this badge
      const badges = service.getUserBadges('user-1');
      expect(badges.filter((b) => b === BadgeType.STREAK_7)).toHaveLength(1);
    });

    it('should throw an error for an invalid badge type', () => {
      expect(() => {
        service.awardBadge('user-1', 'INVALID_BADGE' as BadgeType);
      }).toThrow('Invalid badge type: INVALID_BADGE');
    });

    it('should award different badge types to the same user', () => {
      service.awardBadge('user-1', BadgeType.STREAK_7);
      service.awardBadge('user-1', BadgeType.STREAK_30);
      service.awardBadge('user-1', BadgeType.MILESTONE_10);

      const badges = service.getUserBadges('user-1');
      expect(badges).toHaveLength(3);
      expect(badges).toContain(BadgeType.STREAK_7);
      expect(badges).toContain(BadgeType.STREAK_30);
      expect(badges).toContain(BadgeType.MILESTONE_10);
    });

    it('should handle multiple users independently', () => {
      service.awardBadge('user-1', BadgeType.STREAK_7);
      service.awardBadge('user-2', BadgeType.STREAK_7);

      expect(service.getUserBadges('user-1')).toHaveLength(1);
      expect(service.getUserBadges('user-2')).toHaveLength(1);
    });
  });

  describe('hasBadge', () => {
    it('should return false for user with no badges', () => {
      expect(service.hasBadge('user-1', BadgeType.STREAK_7)).toBe(false);
    });

    it('should return true for user who has the badge', () => {
      service.awardBadge('user-1', BadgeType.STREAK_7);
      expect(service.hasBadge('user-1', BadgeType.STREAK_7)).toBe(true);
    });

    it('should return false for user who does not have the specific badge', () => {
      service.awardBadge('user-1', BadgeType.STREAK_7);
      expect(service.hasBadge('user-1', BadgeType.STREAK_30)).toBe(false);
    });
  });

  describe('getUserBadges', () => {
    it('should return empty array for user with no badges', () => {
      expect(service.getUserBadges('user-1')).toEqual([]);
    });

    it('should return all badges for a user', () => {
      service.awardBadge('user-1', BadgeType.STREAK_7);
      service.awardBadge('user-1', BadgeType.MILESTONE_10);

      const badges = service.getUserBadges('user-1');
      expect(badges).toHaveLength(2);
      expect(badges).toContain(BadgeType.STREAK_7);
      expect(badges).toContain(BadgeType.MILESTONE_10);
    });
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadgeService } from './badge.service';
import { Badge, BadgeType } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';

const mockBadgeRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((d) => d) };
const mockUserBadgeRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((d) => d) };

describe('BadgeService', () => {
  let service: BadgeService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgeService,
        { provide: getRepositoryToken(Badge), useValue: mockBadgeRepo },
        { provide: getRepositoryToken(UserBadge), useValue: mockUserBadgeRepo },
      ],
    }).compile();
    service = module.get<BadgeService>(BadgeService);
    jest.clearAllMocks();
  });

  it('should be defined', () => { expect(service).toBeDefined(); });
  it('getAllBadges returns all badges', async () => {
    mockBadgeRepo.find.mockResolvedValue([{ id: '1' }]);
    expect(await service.getAllBadges()).toHaveLength(1);
  });
  it('awardBadge returns null if badge not found', async () => {
    mockBadgeRepo.findOne.mockResolvedValue(null);
    expect(await service.awardBadge('u1', BadgeType.FIRST_TASK)).toBeNull();
  });
  it('awardBadge skips duplicate', async () => {
    mockBadgeRepo.findOne.mockResolvedValue({ id: 'b1' });
    mockUserBadgeRepo.findOne.mockResolvedValue({ id: 'ub1' });
    await service.awardBadge('u1', BadgeType.FIRST_TASK);
    expect(mockUserBadgeRepo.save).not.toHaveBeenCalled();
 main
  });
});