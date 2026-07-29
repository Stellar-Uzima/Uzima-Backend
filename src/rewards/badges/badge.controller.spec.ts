import { Test, TestingModule } from '@nestjs/testing';
import { BadgeController } from './badge.controller';
import { BadgeService } from './badge.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

const mockBadgeService = {
  getAllBadges: jest.fn(),
  getMyBadges: jest.fn(),
};

describe('BadgeController', () => {
  let controller: BadgeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BadgeController],
      providers: [{ provide: BadgeService, useValue: mockBadgeService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BadgeController>(BadgeController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /badges/me', () => {
    const mockReq = { user: { sub: 'user-123' } };

    it('returns badges for the authenticated user', async () => {
      const expected = {
        userId: 'user-123',
        badges: [
          {
            id: 'ub-1',
            badgeId: 'b-1',
            badgeName: 'First Step',
            badgeType: 'FIRST_TASK',
            badgeDescription: 'Completed your first health task',
            badgeIcon: '/badges/first-task.svg',
            badgeMilestone: 0,
            awardedAt: '2024-01-15T10:00:00.000Z',
          },
        ],
        totalBadges: 1,
      };
      mockBadgeService.getMyBadges.mockResolvedValue(expected);

      const result = await controller.getMyBadges(mockReq);

      expect(mockBadgeService.getMyBadges).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(expected);
    });

    it('returns empty array when user has no badges', async () => {
      const expected = { userId: 'user-123', badges: [], totalBadges: 0 };
      mockBadgeService.getMyBadges.mockResolvedValue(expected);

      const result = await controller.getMyBadges(mockReq);

      expect(result.badges).toEqual([]);
      expect(result.totalBadges).toBe(0);
    });

    it('uses sub as userId from JWT payload', async () => {
      mockBadgeService.getMyBadges.mockResolvedValue({ userId: 'user-123', badges: [], totalBadges: 0 });
      await controller.getMyBadges({ user: { sub: 'user-123', id: 'other-id' } });
      expect(mockBadgeService.getMyBadges).toHaveBeenCalledWith('user-123');
    });
  });
});
