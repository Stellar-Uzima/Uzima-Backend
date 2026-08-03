import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadgeService } from './badge.service';
import { Badge, BadgeType } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';

const mockBadgeRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
};
const mockUserBadgeRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
};

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllBadges', () => {
    it('returns badges with total count', async () => {
      mockBadgeRepo.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      const result = await service.getAllBadges();
      expect(result.badges).toHaveLength(2);
      expect(result.totalBadges).toBe(2);
    });
  });

  describe('getMyBadges', () => {
    it('returns empty badges array when user has no badges', async () => {
      mockUserBadgeRepo.find.mockResolvedValue([]);
      const result = await service.getMyBadges('user-1');
      expect(result.userId).toBe('user-1');
      expect(result.badges).toEqual([]);
      expect(result.totalBadges).toBe(0);
    });

    it('returns mapped badges for a user', async () => {
      const awardedAt = new Date('2024-01-15T10:00:00.000Z');
      mockUserBadgeRepo.find.mockResolvedValue([
        {
          id: 'ub-1',
          badgeId: 'b-1',
          userId: 'user-1',
          awardedAt,
          badge: { name: 'First Step', type: BadgeType.FIRST_TASK, description: 'First task', iconUrl: '/badges/first-task.svg' },
        },
      ]);
      const result = await service.getMyBadges('user-1');
      expect(result.userId).toBe('user-1');
      expect(result.totalBadges).toBe(1);
      expect(result.badges[0]).toMatchObject({
        id: 'ub-1',
        badgeId: 'b-1',
        badgeName: 'First Step',
        badgeType: BadgeType.FIRST_TASK,
        awardedAt: awardedAt.toISOString(),
      });
    });
  });

  describe('awardBadge', () => {
    it('returns null if badge not found', async () => {
      mockBadgeRepo.findOne.mockResolvedValue(null);
      expect(await service.awardBadge('u1', BadgeType.FIRST_TASK)).toBeNull();
    });

    it('skips duplicate and returns existing record', async () => {
      mockBadgeRepo.findOne.mockResolvedValue({ id: 'b1' });
      mockUserBadgeRepo.findOne.mockResolvedValue({ id: 'ub1' });
      await service.awardBadge('u1', BadgeType.FIRST_TASK);
      expect(mockUserBadgeRepo.save).not.toHaveBeenCalled();
    });

    it('saves and returns new user badge', async () => {
      const newBadge = { id: 'ub-new', userId: 'u1', badgeId: 'b1' };
      mockBadgeRepo.findOne.mockResolvedValue({ id: 'b1' });
      mockUserBadgeRepo.findOne.mockResolvedValue(null);
      mockUserBadgeRepo.save.mockResolvedValue(newBadge);
      const result = await service.awardBadge('u1', BadgeType.FIRST_TASK);
      expect(mockUserBadgeRepo.save).toHaveBeenCalled();
      expect(result).toEqual(newBadge);
    });
  });
});
