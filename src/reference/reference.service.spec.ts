import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceService } from './reference.service';
import { MetricsService } from '../shared/metrics/metrics.service';
import { AFRICAN_COUNTRIES } from './data/african-countries';
import { SUPPORTED_LANGUAGES } from './data/supported-languages';
import { SUPPORTED_LANGUAGES as LEGACY_SUPPORTED_LANGUAGES } from './data/languages';

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

const mockMetricsService = {
  incrementCacheHits: jest.fn(),
  incrementCacheMisses: jest.fn(),
};

describe('ReferenceService - getLanguages', () => {
  let service: ReferenceService;
  let redisClient: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferenceService,
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<ReferenceService>(ReferenceService);
    redisClient = (service as any).redisClient;
    jest.clearAllMocks();
  });

  it('should return all 12 languages', async () => {
    redisClient.get.mockResolvedValue(null);
    const result = await service.getLanguages();
    expect(result).toHaveLength(12);
  });

  it('should mark Arabic as RTL', async () => {
    redisClient.get.mockResolvedValue(null);
    const result = await service.getLanguages();
    const arabic = result.find((l: any) => l.code === 'ar');
    expect(arabic.rtl).toBe(true);
  });

  it('should return cached result on second call', async () => {
    const cached = JSON.stringify([{ code: 'en', name: 'English' }]);
    redisClient.get.mockResolvedValue(cached);
    const result = await service.getLanguages();
    expect(result).toEqual([{ code: 'en', name: 'English' }]);
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it('should cache result for 1 hour on first call', async () => {
    redisClient.get.mockResolvedValue(null);
    await service.getLanguages();
    expect(redisClient.setEx).toHaveBeenCalledWith(
      'reference:languages',
      3600,
      JSON.stringify(SUPPORTED_LANGUAGES),
    );
  });
});

describe('Reference data integrity', () => {
  describe('african-countries.ts', () => {
    it('should not contain duplicate country codes', () => {
      const codes = AFRICAN_COUNTRIES.map((c) => c.code);
      const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
      expect(duplicates).toEqual([]);
    });

    it('should not contain malformed country entries', () => {
      for (const country of AFRICAN_COUNTRIES) {
        expect(country.code).toMatch(/^[A-Z]{2}$/);
        expect(country.name.trim().length).toBeGreaterThan(0);
        expect(country.flag.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('supported-languages.ts', () => {
    it('should not contain duplicate language codes', () => {
      const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
      const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
      expect(duplicates).toEqual([]);
    });

    it('should not contain malformed language entries', () => {
      for (const language of SUPPORTED_LANGUAGES) {
        expect(language.code).toMatch(/^[a-z]{2}$/);
        expect(language.name.trim().length).toBeGreaterThan(0);
        expect(language.nativeName.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('languages.ts', () => {
    it('should not contain duplicate language codes', () => {
      const codes = LEGACY_SUPPORTED_LANGUAGES.map((l) => l.code);
      const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
      expect(duplicates).toEqual([]);
    });

    it('should not contain malformed language entries', () => {
      for (const language of LEGACY_SUPPORTED_LANGUAGES) {
        expect(language.code).toMatch(/^[a-z]{2}$/);
        expect(language.name.trim().length).toBeGreaterThan(0);
        expect(language.nativeName.trim().length).toBeGreaterThan(0);
      }
    });

    it('should expose the same language codes as supported-languages.ts (redundant file check)', () => {
      const activeCodes = SUPPORTED_LANGUAGES.map((l) => l.code).sort();
      const legacyCodes = LEGACY_SUPPORTED_LANGUAGES.map((l) => l.code).sort();
      expect(legacyCodes).toEqual(activeCodes);
    });
  });
});
