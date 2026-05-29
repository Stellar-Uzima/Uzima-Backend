// src/shared/analytics/analytics.service.ts

import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Interface representing logged user interactions across the application platform.
 */
export interface UserActionPayload {
  userId: string;
  action: string; // e.g., 'user_login', 'record_creation', 'report_download'
  timestamp: Date;
  metadata?: Record<string, any>; // Extensible context such as IP, device logs, or feature flags
}

/**
 * Interface representing internal architectural server load, memory spikes, or API performance.
 */
export interface SystemMetricPayload {
  metricName: string; // e.g., 'cpu_utilization', 'database_latency_ms', 'memory_leak_bytes'
  value: number;
  timestamp: Date;
  context?: string; // Core origin execution target (e.g., 'auth-module', 'gateway-proxy')
}

/**
 * Structural contract for generated summary data snapshots.
 */
export interface AnalyticsReport {
  generatedAt: Date;
  timeframe: {
    start: Date;
    end: Date;
  };
  totalUserActions: number;
  totalMetricsRecorded: number;
  topActionPatterns: Array<{ action: string; count: number }>;
  averageSystemMetrics: Record<string, number>;
}

export const ANALYTICS_PROVIDERS = 'ANALYTICS_PROVIDERS';

export interface AnalyticsProvider {
  trackEvent(eventName: string, payload?: Record<string, unknown>): Promise<void>;
}

export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  private readonly logger = new Logger(ConsoleAnalyticsProvider.name);

  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    this.logger.log(`Analytics event tracked: ${eventName}`);
    console.log(`[Analytics] ${eventName}`, payload);
  }
}

export class ExternalAnalyticsProvider implements AnalyticsProvider {
  constructor(
    private readonly apiKey?: string,
    private readonly endpoint: string = 'https://analytics.example.com/track',
  ) {}

  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!this.apiKey) {
      return;
    }

    try {
      // Placeholder for real external analytics integration.
      console.log(`[ExternalAnalytics] sending event ${eventName} to ${this.endpoint}`);
      console.log({ apiKey: this.apiKey, eventName, payload });
    } catch (error) {
      console.error('[ExternalAnalytics] failed to track event', error);
    }
  }
}

/**
 * Application-wide analytics service.
 *
 * Combines a NestJS DI-friendly multi-provider dispatcher (`trackEvent`) with the
 * legacy in-memory user-action / system-metric trackers used by older code paths.
 */
@Injectable()
export class AnalyticsService {
  // In-memory operational vectors (kept for backward compatibility with legacy callers)
  private userActionsLog: UserActionPayload[] = [];
  private systemMetricsLog: SystemMetricPayload[] = [];

  constructor(
    @Inject(ANALYTICS_PROVIDERS)
    private readonly providers: AnalyticsProvider[],
  ) {}

  /**
   * Dispatches a single event to every configured analytics provider.
   * Provider failures are logged and swallowed so analytics never break business flows.
   */
  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    await Promise.all(
      this.providers.map((provider) =>
        provider.trackEvent(eventName, payload).catch((error) => {
          console.error(`[AnalyticsService] provider failed to track ${eventName}`, error);
        }),
      ),
    );
  }

  /**
   * Requirement: Track user actions
   * Acceptance Criteria: Analytics tracked
   */
  public trackUserAction(userId: string, action: string, metadata?: Record<string, any>): void {
    this.userActionsLog.push({
      userId,
      action,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Requirement: Track system metrics
   * Acceptance Criteria: Analytics tracked
   */
  public trackSystemMetric(metricName: string, value: number, context?: string): void {
    this.systemMetricsLog.push({
      metricName,
      value,
      timestamp: new Date(),
      context,
    });
  }

  /**
   * Requirement: Analyze patterns
   * Examines historical actions to calculate occurrence counts per specific action name.
   */
  public analyzeActionPatterns(start: Date, end: Date): Record<string, number> {
    const targetActions = this.queryUserActions({ start, end });
    const frequencyDistributionMap: Record<string, number> = {};

    targetActions.forEach((log) => {
      frequencyDistributionMap[log.action] = (frequencyDistributionMap[log.action] || 0) + 1;
    });

    return frequencyDistributionMap;
  }

  /**
   * Requirement: Generate reports
   * Compiles actions frequency data and handles averaged metrics reductions over a timeframe.
   */
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

  /**
   * Dynamic lookup query handler for specific user actions filtering lists.
   */
  public queryUserActions(filters: {
    start?: Date;
    end?: Date;
    userId?: string;
    action?: string;
  }): UserActionPayload[] {
    return this.userActionsLog.filter((log) => {
      if (filters.start && log.timestamp < filters.start) return false;
      if (filters.end && log.timestamp > filters.end) return false;
      if (filters.userId && log.userId !== filters.userId) return false;
      if (filters.action && log.action !== filters.action) return false;
      return true;
    });
  }

  /**
   * Dynamic lookup query handler for checking performance metrics logs.
   */
  public querySystemMetrics(filters: {
    start?: Date;
    end?: Date;
    metricName?: string;
  }): SystemMetricPayload[] {
    return this.systemMetricsLog.filter((metric) => {
      if (filters.start && metric.timestamp < filters.start) return false;
      if (filters.end && metric.timestamp > filters.end) return false;
      if (filters.metricName && metric.metricName !== filters.metricName) return false;
      return true;
    });
  }

  /**
   * Testing Utility — wipes internal tracking frames back to a clean state.
   */
  public clearLogs(): void {
    this.userActionsLog = [];
    this.systemMetricsLog = [];
  }
}
