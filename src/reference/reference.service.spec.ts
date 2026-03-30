import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ReferenceService } from './reference.service';

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
};

describe('ReferenceService - getLanguages', () => {
  let service: ReferenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferenceService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<ReferenceService>(ReferenceService);
    jest.clearAllMocks();
  });

  it('should return all 12 languages', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    const result = await service.getLanguages() as any;
    expect(result.total).toBe(12);
    expect(result.languages).toHaveLength(12);
  });

  it('should mark Arabic as RTL', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    const result = await service.getLanguages() as any;
    const arabic = result.languages.find((l: any) => l.code === 'ar');
    expect(arabic.rtl).toBe(true);
  });

  it('should return cached result on second call', async () => {
    const cached = { total: 12, languages: [] };
    mockCacheManager.get.mockResolvedValue(cached);
    const result = await service.getLanguages();
    expect(result).toEqual(cached);
    expect(mockCacheManager.set).not.toHaveBeenCalled();
  });

  it('should cache result for 1 hour on first call', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    await service.getLanguages();
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'reference:languages',
      expect.any(Object),
      3600000,
    );
  });
});