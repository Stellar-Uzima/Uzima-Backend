import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  PriceFeedService,
  XLM_USD_CACHE_KEY,
  XLM_USD_CACHE_TTL_SECONDS,
} from './price-feed.service';
import { CacheService } from '../shared/cache/cache.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PriceFeedService', () => {
  let service: PriceFeedService;

  const mockCacheService = {
    rememberWithStaleFallback: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {};
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceFeedService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(PriceFeedService);
  });

  it('returns cached price via rememberWithStaleFallback', async () => {
    const snapshot = {
      priceUsd: 0.11,
      source: 'coingecko' as const,
      fetchedAt: '2026-06-01T00:00:00.000Z',
    };
    mockCacheService.rememberWithStaleFallback.mockResolvedValue(snapshot);

    const result = await service.getXlmUsdPrice();

    expect(result).toEqual(snapshot);
    expect(mockCacheService.rememberWithStaleFallback).toHaveBeenCalledWith(
      XLM_USD_CACHE_KEY,
      expect.any(Function),
      XLM_USD_CACHE_TTL_SECONDS,
    );
  });

  it('fetches from CoinGecko when cache miss', async () => {
    mockCacheService.rememberWithStaleFallback.mockImplementation(
      async (_key, fetcher) => fetcher(),
    );
    mockedAxios.get.mockResolvedValueOnce({
      data: { stellar: { usd: 0.15 } },
    });

    const result = await service.getXlmUsdPrice();

    expect(result.priceUsd).toBe(0.15);
    expect(result.source).toBe('coingecko');
    expect(mockedAxios.get).toHaveBeenCalled();
  });

  it('falls back to Stellar DEX when CoinGecko fails', async () => {
    mockCacheService.rememberWithStaleFallback.mockImplementation(
      async (_key, fetcher) => fetcher(),
    );
    mockedAxios.get
      .mockRejectedValueOnce(new Error('CoinGecko down'))
      .mockResolvedValueOnce({
        data: { bids: [{ price_r: '0.14' }], asks: [] },
      });

    const result = await service.getXlmUsdPrice();

    expect(result.priceUsd).toBe(0.14);
    expect(result.source).toBe('stellar-dex');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
