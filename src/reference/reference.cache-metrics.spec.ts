import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceService } from './reference.service';
import { MetricsService } from '../shared/metrics/metrics.service';

// Mock the Redis client so tests do not require a real Redis connection.
// Each Redis method is a Jest mock, allowing tests to control its behavior.
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
  // The service under test, responsible for retrieving and caching reference data.
  let service: ReferenceService;

  // Mock metrics methods so tests can verify whether cache hits and misses are recorded.
  let metricsService: {
    incrementCacheHits: jest.Mock;
    incrementCacheMisses: jest.Mock;
  };

  // Holds the mocked Redis client instance used internally by ReferenceService.
  let redisClient: any;

  // Create a fresh testing module and mock metrics provider before each test.
  beforeEach(async () => {
    metricsService = {
      incrementCacheHits: jest.fn(),
      incrementCacheMisses: jest.fn(),
    };

    // Register ReferenceService and replace MetricsService with our mock.
    // This isolates the tests from the real metrics implementation.
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReferenceService, { provide: MetricsService, useValue: metricsService }],
    }).compile();

    // Retrieve the service instance from the NestJS testing container.
    service = module.get<ReferenceService>(ReferenceService);

    // Access the service's internal Redis client so each test can simulate
    // cached data or a cache miss without contacting Redis.
    redisClient = (service as any).redisClient;

    // Clear mock call history and results to prevent one test affecting another.
    jest.clearAllMocks();
  });

  it('records a cache hit when countries are already cached', async () => {
    // Simulate Redis returning previously cached country data.
    redisClient.get.mockResolvedValue(JSON.stringify([{ code: 'NG' }]));

    // Retrieve countries; the service should use the cached response.
    await service.getCountries();

    // Verify that a cache hit is recorded for the countries cache key.
    expect(metricsService.incrementCacheHits).toHaveBeenCalledWith('reference:countries');

    // A cache hit should not also be recorded as a cache miss.
    expect(metricsService.incrementCacheMisses).not.toHaveBeenCalled();
  });

  it('records a cache miss when countries are not cached', async () => {
    // Simulate a cache miss: Redis has no value for the countries key.
    redisClient.get.mockResolvedValue(null);

    // Simulate a successful write when the service caches the fetched data.
    redisClient.setEx.mockResolvedValue('OK');

    // Retrieve countries; the service should follow its cache-miss path.
    await service.getCountries();

    // Verify that the cache miss metric is recorded for countries.
    expect(metricsService.incrementCacheMisses).toHaveBeenCalledWith('reference:countries');

    // No cache hit should be recorded for this request.
    expect(metricsService.incrementCacheHits).not.toHaveBeenCalled();
  });

  it('records a cache hit when languages are already cached', async () => {
    // Simulate Redis returning previously cached language data.
    redisClient.get.mockResolvedValue(JSON.stringify([{ code: 'en' }]));

    // Retrieve languages using the cached response.
    await service.getLanguages();

    // Verify that a cache hit is recorded for the languages cache key.
    expect(metricsService.incrementCacheHits).toHaveBeenCalledWith('reference:languages');
  });

  it('records a cache miss when languages are not cached', async () => {
    // Simulate Redis returning no cached language data.
    redisClient.get.mockResolvedValue(null);

    // Simulate a successful cache write after the service fetches the data.
    redisClient.setEx.mockResolvedValue('OK');

    // Retrieve languages; the service should follow its cache-miss path.
    await service.getLanguages();

    // Verify that the cache miss metric is recorded for languages.
    expect(metricsService.incrementCacheMisses).toHaveBeenCalledWith('reference:languages');
  });
});
