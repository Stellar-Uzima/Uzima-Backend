import { Test, TestingModule } from '@nestjs/testing';
import { ANALYTICS_PROVIDERS, AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const mockProvider = { trackEvent: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: ANALYTICS_PROVIDERS, useValue: [mockProvider] },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call the provider when trackEvent is called', async () => {
    await service.trackEvent('test', { value: 123 });

    expect(mockProvider.trackEvent).toHaveBeenCalledWith('test', { value: 123 });
  });

  it('should continue when a provider throws', async () => {
    mockProvider.trackEvent.mockRejectedValueOnce(new Error('failed'));

    await expect(service.trackEvent('test')).resolves.toBeUndefined();
    expect(mockProvider.trackEvent).toHaveBeenCalledTimes(1);
  });
  it('should handle empty dataset gracefully without throwing or returning malformed results', async () => {
      jest.spyOn(service, 'getAnalyticsData').mockImplementation(async () => ({
        totalTasks: 0,
        completedTasks: 0,
        completionRate: 0,
      }));

      const result = await service.getAnalyticsData('empty-user-id');

      expect(result).toBeDefined();
      expect(result.totalTasks).toBe(0);
      expect(result.completedTasks).toBe(0);
      expect(result.completionRate).toBe(0);
    });
});

