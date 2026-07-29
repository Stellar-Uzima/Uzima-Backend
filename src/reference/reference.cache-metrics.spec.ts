import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceService } from './reference.service';
import { MetricsService } from '../shared/metrics/metrics.service';

// Mock the redis client so no real Redis connection is needed in tests
jest.mock('redis', () => {
  return {
    createClient: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
    })),
  };
});

describe('ReferenceService - cache metrics', () => {
  let service: ReferenceService;
  let metricsService: { incrementCacheHits: jest.Mock; incrementCacheMisses: jest.Mock };
  let redisClient: any;

  beforeEach(async () => {
    metricsService = {
      incrementCacheHits: jest.fn(),
      incrementCacheMisses: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferenceService,
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<ReferenceService>(ReferenceService);
    redisClient = (service as any).redisClient;
    jest.clearAllMocks();
  });

  it('records a cache hit when countries are already cached', async () => {
    redisClient.get.mockResolvedValue(JSON.stringify([{ code: 'NG' }]));
    await service.getCountries();
    expect(metricsService.incrementCacheHits).toHaveBeenCalledWith('reference:countries');
    expect(metricsService.incrementCacheMisses).not.toHaveBeenCalled();
  });

  it('records a cache miss when countries are not cached', async () => {
    redisClient.get.mockResolvedValue(null);
    redisClient.setEx.mockResolvedValue('OK');
    await service.getCountries();
    expect(metricsService.incrementCacheMisses).toHaveBeenCalledWith('reference:countries');
    expect(metricsService.incrementCacheHits).not.toHaveBeenCalled();
  });

  it('records a cache hit when languages are already cached', async () => {
    redisClient.get.mockResolvedValue(JSON.stringify([{ code: 'en' }]));
    await service.getLanguages();
    expect(metricsService.incrementCacheHits).toHaveBeenCalledWith('reference:languages');
  });

  it('records a cache miss when languages are not cached', async () => {
    redisClient.get.mockResolvedValue(null);
    redisClient.setEx.mockResolvedValue('OK');
    await service.getLanguages();
    expect(metricsService.incrementCacheMisses).toHaveBeenCalledWith('reference:languages');
  });
});
