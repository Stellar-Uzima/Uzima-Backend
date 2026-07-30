import { Test, TestingModule } from '@nestjs/testing';
import { XlmPriceService } from './xlm-price.service';

jest.mock('./price-feed.service', () => ({
  PriceFeedService: class MockPriceFeedService {
    getXlmUsdPrice = jest.fn();
  },
}));

import { PriceFeedService } from './price-feed.service';

interface XlmPriceSnapshot {
  priceUsd: number;
  source: string;
  fetchedAt: string;
}

describe('XlmPriceService', () => {
  let service: XlmPriceService;
  let priceFeedService: PriceFeedService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XlmPriceService, PriceFeedService],
    }).compile();

    service = module.get(XlmPriceService);
    priceFeedService = module.get(PriceFeedService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getXlmUsdRate', () => {
    it('should return the price from the price feed snapshot', async () => {
      const snapshot: XlmPriceSnapshot = {
        priceUsd: 0.123456,
        source: 'coingecko',
        fetchedAt: '2026-07-30T12:00:00.000Z',
      };
      (priceFeedService.getXlmUsdPrice as jest.Mock).mockResolvedValue(snapshot);

      const result = await service.getXlmUsdRate();

      expect(result).toBe(0.123456);
    });

    it('should call priceFeedService.getXlmUsdPrice once', async () => {
      const snapshot: XlmPriceSnapshot = {
        priceUsd: 0.12,
        source: 'coingecko',
        fetchedAt: '2026-07-30T12:00:00.000Z',
      };
      (priceFeedService.getXlmUsdPrice as jest.Mock).mockResolvedValue(snapshot);

      await service.getXlmUsdRate();

      expect(priceFeedService.getXlmUsdPrice).toHaveBeenCalledTimes(1);
    });
  });
});
