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

  describe('empty dataset handling', () => {
    it('should generate a valid analytics report when dataset is empty', () => {
      service.clearLogs();
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-01-31T23:59:59.999Z');

      const report = service.generateAnalyticsReport(start, end);

      expect(report).toBeDefined();
      expect(report.totalUserActions).toBe(0);
      expect(report.totalMetricsRecorded).toBe(0);
      expect(report.topActionPatterns).toEqual([]);
      expect(report.averageSystemMetrics).toEqual({});
      expect(report.timeframe).toEqual({ start, end });
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should return an empty frequency map when analyzing action patterns on empty data', () => {
      service.clearLogs();
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-01-31T23:59:59.999Z');

      const patterns = service.analyzeActionPatterns(start, end);

      expect(patterns).toEqual({});
    });

    it('should return empty arrays when querying user actions and system metrics for non-existent or new user', () => {
      service.clearLogs();
      const userActions = service.queryUserActions({ userId: 'empty-user-id' });
      const systemMetrics = service.querySystemMetrics({ metricName: 'non_existent_metric' });

      expect(userActions).toEqual([]);
      expect(systemMetrics).toEqual([]);
    });
  });
});
