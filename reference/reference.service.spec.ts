import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceService } from './reference.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('ReferenceService', () => {
  let service: ReferenceService;

  // Fully mock the cache manager methods
  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferenceService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<ReferenceService>(ReferenceService);
    
    // Clear mock history between tests
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all 12 languages', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    const result = await service.getLanguages() as any;
    expect(result.total).toBe(12);
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
    expect(mockCacheManager.get).toHaveBeenCalledTimes(1);
  });

  it('should cache result for 1 hour on first call', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    await service.getLanguages();
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'languages_list',
      expect.any(Object),
      3600000 // 1 hour in milliseconds
    );
  });
});