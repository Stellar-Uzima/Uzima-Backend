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
  count: jest.fn(),
};
const mockUserBadgeRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
  count: jest.fn(),
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
  });

  describe('getUserBadgeCount', () => {
    it('returns badge count using a COUNT query', async () => {
      mockUserBadgeRepo.count.mockResolvedValue(3);

      const result = await service.getUserBadgeCount('user-1');

      expect(result).toEqual({ count: 3 });
      expect(mockUserBadgeRepo.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(mockUserBadgeRepo.find).not.toHaveBeenCalled();
    });

    it('returns zero when the user has no badges', async () => {
      mockUserBadgeRepo.count.mockResolvedValue(0);

      await expect(service.getUserBadgeCount('user-2')).resolves.toEqual({ count: 0 });
    });
  });

  describe('initializeBadges', () => {
    it('skips seeding when badges already exist', async () => {
      mockBadgeRepo.count.mockResolvedValue(2);

      await service.initializeBadges();

      expect(mockBadgeRepo.save).not.toHaveBeenCalled();
    });

    it('seeds default badges when none exist', async () => {
      mockBadgeRepo.count.mockResolvedValue(0);
      mockBadgeRepo.save.mockResolvedValue({});

      await service.initializeBadges();

      expect(mockBadgeRepo.save).toHaveBeenCalled();
    });
  });
});
