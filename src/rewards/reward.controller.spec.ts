import { Test, TestingModule } from '@nestjs/testing';
import { RewardController } from './reward.controller';
import { RewardService } from './reward.service';
import { PriceFeedService } from '../stellar/price-feed.service';

describe('RewardController', () => {
  let controller: RewardController;

  const mockRewardService = {
    emitMilestoneIfReached: jest.fn(),
    getRewardHistory: jest.fn(),
  };

  const mockPriceFeedService = {
    getXlmUsdPrice: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RewardController],
      providers: [
        { provide: RewardService, useValue: mockRewardService },
        { provide: PriceFeedService, useValue: mockPriceFeedService },
      ],
    }).compile();

    controller = module.get(RewardController);
  });

  describe('getXlmPrice', () => {
    it('returns XLM/USD price from price feed', async () => {
      mockPriceFeedService.getXlmUsdPrice.mockResolvedValue({
        priceUsd: 0.12,
        source: 'coingecko',
        fetchedAt: '2026-06-01T12:00:00.000Z',
      });

      const result = await controller.getXlmPrice();

      expect(result).toEqual({
        priceUsd: 0.12,
        source: 'coingecko',
        fetchedAt: '2026-06-01T12:00:00.000Z',
        currency: 'USD',
      });
    });
  });
});
