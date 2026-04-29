import { Injectable, Logger } from '@nestjs/common';

export interface UserActionEvent {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface SystemMetricEvent {
  metric: string;
  value: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface AnalyticsReport {
  totalUserActions: number;
  totalSystemMetrics: number;
  topActions: Array<{ action: string; count: number }>;
  metricAverages: Record<string, number>;
  generatedAt: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  private readonly userActions: UserActionEvent[] = [];
  private readonly systemMetrics: SystemMetricEvent[] = [];

  trackUserAction(userId: string, action: string, metadata?: Record<string, unknown>): void {
    const event: UserActionEvent = {
      userId,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.userActions.push(event);

    this.logger.log(`Tracked user action: ${action} for user ${userId}`);
  }

  trackSystemMetric(metric: string, value: number, metadata?: Record<string, unknown>): void {
    const event: SystemMetricEvent = {
      metric,
      value,
      metadata,
      timestamp: new Date().toISOString(),
    };

    this.systemMetrics.push(event);

    this.logger.log(`Tracked system metric: ${metric}=${value}`);
  }

  analyzeUserPatterns() {
    const actionCounts: Record<string, number> = {};

    for (const event of this.userActions) {
      actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
    }

    return Object.entries(actionCounts)
      .map(([action, count]) => ({
        action,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  analyzeSystemMetrics() {
    const metricGroups: Record<string, number[]> = {};

    for (const metric of this.systemMetrics) {
      if (!metricGroups[metric.metric]) {
        metricGroups[metric.metric] = [];
      }

      metricGroups[metric.metric].push(metric.value);
    }

    const averages: Record<string, number> = {};

    for (const [metric, values] of Object.entries(metricGroups)) {
      averages[metric] = values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    return averages;
  }

  generateReport(): AnalyticsReport {
    return {
      totalUserActions: this.userActions.length,
      totalSystemMetrics: this.systemMetrics.length,
      topActions: this.analyzeUserPatterns(),
      metricAverages: this.analyzeSystemMetrics(),
      generatedAt: new Date().toISOString(),
    };
  }

  queryUserActions(filter?: Partial<UserActionEvent>): UserActionEvent[] {
    if (!filter) return [...this.userActions];

    return this.userActions.filter(event =>
      Object.entries(filter).every(([key, value]) => event[key as keyof UserActionEvent] === value)
    );
  }

  querySystemMetrics(filter?: Partial<SystemMetricEvent>): SystemMetricEvent[] {
    if (!filter) return [...this.systemMetrics];

    return this.systemMetrics.filter(event =>
      Object.entries(filter).every(
        ([key, value]) => event[key as keyof SystemMetricEvent] === value
      )
    );
  }

  resetAnalytics(): void {
    this.userActions.length = 0;
    this.systemMetrics.length = 0;
  }
}
