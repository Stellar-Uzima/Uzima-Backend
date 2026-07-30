// src/shared/analytics/analytics.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';

export const ANALYTICS_PROVIDERS = 'ANALYTICS_PROVIDERS';

export interface UserActionPayload {
  userId: string;
  action: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface SystemMetricPayload {
  metricName: string;
  value: number;
  timestamp: Date;
  context?: string;
}

export interface AnalyticsReport {
  generatedAt: Date;
  timeframe: { start: Date; end: Date };
  totalUserActions: number;
  totalMetricsRecorded: number;
  topActionPatterns: Array<{ action: string; count: number }>;
  averageSystemMetrics: Record<string, number>;
}

export interface AnalyticsProvider {
  trackEvent(eventName: string, payload?: Record<string, unknown>): Promise<void>;
}

export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  private readonly logger = new Logger(ConsoleAnalyticsProvider.name);

  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    this.logger.log(Analytics event tracked: );
    console.log([Analytics] , payload);
  }
}

export class ExternalAnalyticsProvider implements AnalyticsProvider {
  constructor(
    private readonly apiKey?: string,
    private readonly endpoint: string = 'https://analytics.example.com/track',
  ) {}

  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!this.apiKey) return;
    try {
      console.log([ExternalAnalytics] sending event  to );
      console.log({ apiKey: this.apiKey, eventName, payload });
    } catch (err) {
      console.error('[ExternalAnalytics] failed to track event', err);
    }
  }
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  private userActionsLog: UserActionPayload[] = [];
  private systemMetricsLog: SystemMetricPayload[] = [];

  constructor(@Inject(ANALYTICS_PROVIDERS) private readonly providers: AnalyticsProvider[]) {}

  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    await Promise.all(
      this.providers.map((provider) =>
        provider.trackEvent(eventName, payload).catch((err) => {
          console.error([AnalyticsService] provider failed to track , err);
        }),
      ),
    );
  }

  public trackUserAction(userId: string, action: string, metadata?: Record<string, any>): void {
    this.userActionsLog.push({ userId, action, timestamp: new Date(), metadata });
  }

  public trackSystemMetric(metricName: string, value: number, context?: string): void {
    this.systemMetricsLog.push({ metricName, value, timestamp: new Date(), context });
  }

  public analyzeActionPatterns(start: Date, end: Date): Record<string, number> {
    const targetActions = this.queryUserActions({ start, end });
    const frequencyDistributionMap: Record<string, number> = {};
    targetActions.forEach((log) => {
      frequencyDistributionMap[log.action] = (frequencyDistributionMap[log.action] || 0) + 1;
    });
    return frequencyDistributionMap;
  }

  public generateAnalyticsReport(start: Date, end: Date): AnalyticsReport {
    const actionsInPeriod = this.queryUserActions({ start, end });
    const metricsInPeriod = this.querySystemMetrics({ start, end });

    const patternMap = this.analyzeActionPatterns(start, end);
    const topActionPatterns = Object.entries(patternMap)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    const metricAveragesAccumulator: Record<string, { total: number; count: number }> = {};
    metricsInPeriod.forEach((metric) => {
      if (!metricAveragesAccumulator[metric.metricName]) {
        metricAveragesAccumulator[metric.metricName] = { total: 0, count: 0 };
      }
      metricAveragesAccumulator[metric.metricName].total += metric.value;
      metricAveragesAccumulator[metric.metricName].count += 1;
    });

    const averageSystemMetrics: Record<string, number> = {};
    Object.entries(metricAveragesAccumulator).forEach(([name, data]) => {
      averageSystemMetrics[name] = Number((data.total / data.count).toFixed(2));
    });

    return {
      generatedAt: new Date(),
      timeframe: { start, end },
      totalUserActions: actionsInPeriod.length,
      totalMetricsRecorded: metricsInPeriod.length,
      topActionPatterns,
      averageSystemMetrics,
    };
  }

  public queryUserActions(filters: { start?: Date; end?: Date; userId?: string; action?: string }): UserActionPayload[] {
    return this.userActionsLog.filter((log) => {
      if (filters.start && log.timestamp < filters.start) return false;
      if (filters.end && log.timestamp > filters.end) return false;
      if (filters.userId && log.userId !== filters.userId) return false;
      if (filters.action && log.action !== filters.action) return false;
      return true;
    });
  }

  public querySystemMetrics(filters: { start?: Date; end?: Date; metricName?: string }): SystemMetricPayload[] {
    return this.systemMetricsLog.filter((metric) => {
      if (filters.start && metric.timestamp < filters.start) return false;
      if (filters.end && metric.timestamp > filters.end) return false;
      if (filters.metricName && metric.metricName !== filters.metricName) return false;
      return true;
    });
  }

  public clearLogs(): void {
    this.userActionsLog = [];
    this.systemMetricsLog = [];
  }
}
