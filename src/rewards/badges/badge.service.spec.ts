import { Test, TestingModule } from '@nestjs/testing';
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
  });
});