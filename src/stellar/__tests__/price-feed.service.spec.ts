import { Test, TestingModule } from '@nestjs/testing';
import { PriceFeedService } from '../price-feed.service';
import { CacheService } from '../../shared/cache/cache.service';
import axios from 'axios';
import { describe, it, beforeEach, expect, jest } from '@jest/globals';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PriceFeedService Unit Tests', () => {
  let service: PriceFeedService;
  let cacheService: CacheService;

  // Typing the properties explicitly as jest.Mock removes type parameter dependency loops
  const mockCacheService = {
    remember: jest.fn() as jest.Mock<any>,
    get: jest.fn() as jest.Mock<any>,
    set: jest.fn() as jest.Mock<any>,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceFeedService,
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<PriceFeedService>(PriceFeedService);
    cacheService = module.get<CacheService>(CacheService);
    jest.clearAllMocks();
  });

  it('should deliver cached value when remember yields execution records', async () => {
    mockCacheService.remember.mockResolvedValueOnce(0.145);

    const result = await service.getXlmPrice();

    expect(result).toEqual({ price: 0.145, cached: true });
    expect(mockCacheService.remember).toHaveBeenCalledWith(
      'rewards:xlm_usd_price',
      expect.any(Function),
      300,
    );
  });

  it('should fallback gracefully to stale cache structure if remember block throws error', async () => {
    mockCacheService.remember.mockRejectedValueOnce(new Error('API Timeout'));
    mockCacheService.get.mockResolvedValueOnce(0.138);

    const result = await service.getXlmPrice();

    expect(result).toEqual({ price: 0.138, cached: true });
    expect(mockCacheService.get).toHaveBeenCalledWith('rewards:xlm_usd_price:stale');
  });
});