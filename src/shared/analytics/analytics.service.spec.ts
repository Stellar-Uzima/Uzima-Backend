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

    it('should clear both user action and system metric logs when clearLogs is called', () => {
      service.trackUserAction('user-1', 'login');
      service.trackSystemMetric('cpu', 50);

      expect(service.queryUserActions({})).toHaveLength(1);
      expect(service.querySystemMetrics({})).toHaveLength(1);

      service.clearLogs();

      expect(service.queryUserActions({})).toHaveLength(0);
      expect(service.querySystemMetrics({})).toHaveLength(0);
    });

    it('should return empty results when querying with no filters on a fresh service', () => {
      service.clearLogs();

      const userActions = service.queryUserActions({});
      const systemMetrics = service.querySystemMetrics({});

      expect(userActions).toEqual([]);
      expect(systemMetrics).toEqual([]);
    });

    it('should produce a report with valid structure when only user actions exist but no system metrics', () => {
      service.clearLogs();
      service.trackUserAction('user-1', 'login');
      service.trackUserAction('user-1', 'login');

      const start = new Date('2020-01-01T00:00:00.000Z');
      const end = new Date('2030-12-31T23:59:59.999Z');
      const report = service.generateAnalyticsReport(start, end);

      expect(report.totalUserActions).toBe(2);
      expect(report.totalMetricsRecorded).toBe(0);
      expect(report.topActionPatterns).toEqual([{ action: 'login', count: 2 }]);
      expect(report.averageSystemMetrics).toEqual({});
    });

    it('should produce a report with valid structure when only system metrics exist but no user actions', () => {
      service.clearLogs();
      service.trackSystemMetric('memory', 1024);

      const start = new Date('2020-01-01T00:00:00.000Z');
      const end = new Date('2030-12-31T23:59:59.999Z');
      const report = service.generateAnalyticsReport(start, end);

      expect(report.totalUserActions).toBe(0);
      expect(report.totalMetricsRecorded).toBe(1);
      expect(report.topActionPatterns).toEqual([]);
      expect(report.averageSystemMetrics).toEqual({ memory: 1024 });
    });

    it('should filter out actions outside the timeframe and return empty for empty range', () => {
      service.trackUserAction('user-1', 'click');

      const pastStart = new Date('2020-01-01T00:00:00.000Z');
      const pastEnd = new Date('2020-01-02T00:00:00.000Z');
      const actions = service.queryUserActions({ start: pastStart, end: pastEnd });

      expect(actions).toHaveLength(0);
    });
  });
});
