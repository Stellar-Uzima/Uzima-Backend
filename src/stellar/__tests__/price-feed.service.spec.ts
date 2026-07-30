import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PriceFeedService, XlmPriceSnapshot } from '../price-feed.service';
import { CacheService } from '../../shared/cache/cache.service';
import axios from 'axios';
import { describe, it, beforeEach, expect, jest } from '@jest/globals';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PriceFeedService Unit Tests', () => {
  let service: PriceFeedService;

  const mockCacheService = {
    rememberWithStaleFallback: jest.fn() as jest.Mock<any>,
  };

  const mockConfigService = {
    get: jest.fn() as jest.Mock<any>,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceFeedService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PriceFeedService>(PriceFeedService);
    jest.clearAllMocks();
  });

  it('should deliver cached value when rememberWithStaleFallback yields a snapshot', async () => {
    const snapshot: XlmPriceSnapshot = {
      priceUsd: 0.145,
      source: 'coingecko',
      fetchedAt: '2026-06-01T00:00:00.000Z',
    };
    mockCacheService.rememberWithStaleFallback.mockResolvedValueOnce(snapshot);

    const result = await service.getXlmUsdPrice();

    expect(result).toEqual(snapshot);
  });
});
