import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UxDegradationEvent,
  DegradationMetric,
  DegradationStatus,
} from './entities/ux-degradation-event.entity';

const MAX_SAMPLES_PER_ROUTE = 500;

interface RouteWindow {
  durations: number[];
  statuses: number[];
  consecutive5xx: number;
}

interface ActiveFlag {
  metric: DegradationMetric;
  eventId: string;
}

/**
 * Detects UX degradation per route (slow pages and rising error rates) and
 * persists durable events so the team can monitor the experience, not just
 * the infra (#1377).
 *
 * ## How it works
 * - `observe()` records every request's latency/status into an in-memory
 *   sliding sample window keyed by `METHOD route`.
 * - A periodic `@Cron` sweep evaluates each window: a route is flagged when
 *   its p95 latency, error rate or consecutive 5xx run crosses the
 *   configured threshold.
 * - Flags are durable: a single `UxDegradationEvent` row is written when a
 *   route degrades and auto-resolved when metrics recover, preventing event
 *   spam while still giving operators a precise timeline.
 *
 * Thresholds (env-configurable):
 *  - `UX_DEGRADATION_LATENCY_P95_MS`  (default 5000)
 *  - `UX_DEGRADATION_ERROR_RATE`      (default 0.05)
 *  - `UX_DEGRADATION_CONSECUTIVE_5XX` (default 5)
 */
@Injectable()
export class UxHealthMonitorService {
  private readonly logger = new Logger(UxHealthMonitorService.name);
  private readonly windows = new Map<string, RouteWindow>();
  private readonly activeFlags = new Map<string, ActiveFlag[]>();

  private readonly latencyP95Ms: number;
  private readonly errorRate: number;
  private readonly consecutive5xx: number;

  constructor(
    @InjectRepository(UxDegradationEvent)
    private readonly eventRepo: Repository<UxDegradationEvent>,
    private readonly configService: ConfigService,
  ) {
    this.latencyP95Ms = Number(configService.get('UX_DEGRADATION_LATENCY_P95_MS', 5000));
    this.errorRate = Number(configService.get('UX_DEGRADATION_ERROR_RATE', 0.05));
    this.consecutive5xx = Number(configService.get('UX_DEGRADATION_CONSECUTIVE_5XX', 5));
  }

  /**
   * Feeds one observed request into the sliding window. Called from the
   * shared `MonitoringService.monitorPerformance`.
   */
  observe(route: string, method: string, statusCode: number, durationMs: number): void {
    const key = this.key(method, route);
    let window = this.windows.get(key);
    if (!window) {
      window = { durations: [], statuses: [], consecutive5xx: 0 };
      this.windows.set(key, window);
    }
    window.durations.push(durationMs);
    window.statuses.push(statusCode);
    if (statusCode >= 500) {
      window.consecutive5xx += 1;
    } else {
      window.consecutive5xx = 0;
    }
    if (window.durations.length > MAX_SAMPLES_PER_ROUTE) {
      window.durations.shift();
      window.statuses.shift();
    }
  }

  /**
   * Evaluates all windows and reconciles active/resolved degradation events.
   * Runs automatically via the scheduler.
   */
  async evaluate(now = new Date()): Promise<void> {
    for (const [key, window] of this.windows) {
      const [method, route] = key.split(' ', 2);
      await this.evaluateWindow(method, route, window, now);
    }
  }

  /**
   * Summary of UX health for dashboards and the `/ux-monitoring/health`
   * endpoint.
   */
  async getHealthSummary(): Promise<Record<string, unknown>> {
    const [active, recent] = await Promise.all([
      this.eventRepo.find({
        where: { status: DegradationStatus.ACTIVE },
      }),
      this.eventRepo.find({
        order: { detectedAt: 'DESC' },
        take: 20,
      }),
    ]);

    const degradedRoutes = new Map<string, { p95Ms?: number; errorRate?: number; consecutive5xx?: number }>();
    for (const [key, window] of this.windows) {
      const [, route] = key.split(' ', 2);
      const entry = degradedRoutes.get(route) ?? {};
      const p95 = this.percentile(window.durations, 0.95);
      const errRate = window.statuses.filter((s) => s >= 400).length / window.statuses.length;
      if (p95 >= this.latencyP95Ms) entry.p95Ms = Math.round(p95);
      if (errRate >= this.errorRate) entry.errorRate = Number(errRate.toFixed(4));
      if (window.consecutive5xx >= this.consecutive5xx) entry.consecutive5xx = window.consecutive5xx;
      degradedRoutes.set(route, entry);
    }

    return {
      overallStatus:
        active.length > 0 || this.activeFlags.size > 0 ? 'degraded' : 'healthy',
      trackedRoutes: this.windows.size,
      activeDegradations: active.length,
      degradedRoutes: Object.fromEntries(degradedRoutes),
      recentEvents: recent,
    };
  }

  private async evaluateWindow(
    method: string,
    route: string,
    window: RouteWindow,
    now: Date,
  ): Promise<void> {
    const p95 = this.percentile(window.durations, 0.95);
    const errorRate =
      window.statuses.length > 0
        ? window.statuses.filter((s) => s >= 400).length / window.statuses.length
        : 0;

    const flags: Array<{ metric: DegradationMetric; observed: number; threshold: number }> = [];
    if (p95 >= this.latencyP95Ms) {
      flags.push({ metric: DegradationMetric.LATENCY_P95, observed: p95, threshold: this.latencyP95Ms });
    }
    if (errorRate >= this.errorRate) {
      flags.push({ metric: DegradationMetric.ERROR_RATE, observed: errorRate, threshold: this.errorRate });
    }
    if (window.consecutive5xx >= this.consecutive5xx) {
      flags.push({
        metric: DegradationMetric.CONSECUTIVE_5XX,
        observed: window.consecutive5xx,
        threshold: this.consecutive5xx,
      });
    }

    const key = this.key(method, route);
    const active = this.activeFlags.get(key) ?? [];

    // React to currently-firing flags that are not yet represented.
    for (const flag of flags) {
      if (!active.some((a) => a.metric === flag.metric)) {
        const event = await this.eventRepo.save(
          this.eventRepo.create({
            method,
            route,
            metric: flag.metric,
            threshold: flag.threshold,
            observedValue: flag.observed,
            sampleCount: window.durations.length,
            status: DegradationStatus.ACTIVE,
            detectedAt: now,
            resolvedAt: null,
          }),
        );
        active.push({ metric: flag.metric, eventId: event.id });
        this.logger.error(
          `UX_DEGRADATION: ${method} ${route} — ${flag.metric} observed=${flag.observed.toFixed(4)} threshold=${flag.threshold}`,
        );
      }
    }

    // Resolve flags whose metric recovered.
    const firing = new Set(flags.map((f) => f.metric));
    for (const flag of active) {
      if (!firing.has(flag.metric)) {
        await this.eventRepo.update(flag.eventId, {
          status: DegradationStatus.RESOLVED,
          resolvedAt: now,
        });
        this.logger.log(`UX degradation resolved: ${method} ${route} — ${flag.metric}`);
        active.splice(active.indexOf(flag), 1);
      }
    }

    this.activeFlags.set(key, active);
  }

  private key(method: string, route: string): string {
    return `${method} ${route}`.toUpperCase();
  }

  private percentile(sortedSource: number[], p: number): number {
    if (sortedSource.length === 0) return 0;
    const sorted = [...sortedSource].sort((a, b) => a - b);
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
  }
}