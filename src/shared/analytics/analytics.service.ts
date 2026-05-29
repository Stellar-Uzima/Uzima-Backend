// src/shared/analytics/analytics.service.ts

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

import { Inject, Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_PROVIDERS)
    private readonly providers: AnalyticsProvider[],
  ) {}

  async trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
    await Promise.all(
      this.providers.map((provider) =>
        provider.trackEvent(eventName, payload).catch((error) => {
          console.error(`[AnalyticsService] provider failed to track ${eventName}`, error);
        }),
      ),
    );
  }
}
