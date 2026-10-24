import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly httpRequestsTotal: Counter<string>,
    @InjectMetric('http_requests_success_total')
    private readonly httpRequestsSuccessTotal: Counter<string>,
    @InjectMetric('http_requests_failed_total')
    private readonly httpRequestsFailedTotal: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly httpRequestDuration: Histogram<string>,
    @InjectMetric('database_queries_total')
    private readonly dbQueriesTotal: Counter<string>,
    @InjectMetric('database_slow_queries_total')
    private readonly dbSlowQueriesTotal: Counter<string>,
    @InjectMetric('database_query_duration_seconds')
    private readonly dbQueryDuration: Histogram<string>,
    @InjectMetric('cache_hits_total')
    private readonly cacheHitsTotal: Counter<string>,
    @InjectMetric('cache_misses_total')
    private readonly cacheMissesTotal: Counter<string>,
    @InjectMetric('notification_deliveries_total')
    private readonly notificationDeliveriesTotal: Counter<string>,
    @InjectMetric('notification_delivery_retries_total')
    private readonly notificationDeliveryRetriesTotal: Counter<string>,
    @InjectMetric('notification_permanent_failures_total')
    private readonly notificationPermanentFailuresTotal: Counter<string>,
    @InjectMetric('notification_terminal_failures_total')
    private readonly notificationTerminalFailuresTotal: Counter<string>,
    @InjectMetric('notification_provider_circuit_state')
    private readonly notificationCircuitState: Gauge<string>,
    @InjectMetric('system_memory_usage_bytes')
    private readonly memoryUsage: Gauge<string>,
    @InjectMetric('system_cpu_usage_percent')
    private readonly cpuUsage: Gauge<string>,
  ) {}

  incrementHttpRequests(method: string, route: string, statusCode: number) {
    method = normalizeHttpMethod(method);
    route = normalizeRoute(route);
    statusCode = normalizeStatusCode(statusCode);
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
    if (statusCode >= 400) {
      this.incrementHttpFailedRequests(method, route, statusCode);
    } else {
      this.incrementHttpSuccessRequests(method, route);
    }
  }

  incrementHttpSuccessRequests(method: string, route: string) {
    this.httpRequestsSuccessTotal.inc({ method: normalizeHttpMethod(method), route: normalizeRoute(route) });
  }

  incrementHttpFailedRequests(method: string, route: string, statusCode: number) {
    this.httpRequestsFailedTotal.inc({
      method: normalizeHttpMethod(method),
      route: normalizeRoute(route),
      status_code: normalizeStatusCode(statusCode).toString(),
    });
  }

  recordHttpRequestDuration(method: string, route: string, durationSeconds: number) {
    this.httpRequestDuration.observe({ method: normalizeHttpMethod(method), route: normalizeRoute(route) }, durationSeconds);
  }

  incrementDbQueries(operation: string) {
    this.dbQueriesTotal.inc({ operation: normalizeDbOperation(operation) });
  }

  recordDbQueryDuration(operation: string, duration: number) {
    this.dbQueryDuration.observe({ operation: normalizeDbOperation(operation) }, duration);
  }

  incrementSlowDbQueries(operation: string) {
    this.dbSlowQueriesTotal.inc({ operation: normalizeDbOperation(operation) });
  }

  incrementCacheHits(cacheName: string = 'default') {
    this.cacheHitsTotal.inc({ cache_name: cacheName });
  }

  incrementCacheMisses(cacheName: string = 'default') {
    this.cacheMissesTotal.inc({ cache_name: cacheName });
  }

  recordNotificationDelivery(channel: string, outcome: 'success' | 'failure' | 'circuit_open') {
    this.notificationDeliveriesTotal.inc({ channel, outcome });
  }

  incrementNotificationDeliveryRetries(channel: string) {
    this.notificationDeliveryRetriesTotal.inc({ channel });
  }

  setNotificationCircuitOpen(channel: string, isOpen: boolean) {
    this.notificationCircuitState.set({ channel }, isOpen ? 1 : 0);
  }

  recordPermanentProviderFailure(channel: string) {
    this.notificationPermanentFailuresTotal.inc({ channel });
  }

  recordTerminalDeliveryFailure(channel: string) {
    this.notificationTerminalFailuresTotal.inc({ channel });
  }

  setMemoryUsage(bytes: number) {
    this.memoryUsage.set(bytes);
  }

  setCpuUsage(percent: number) {
    this.cpuUsage.set(percent);
  }
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const DB_OPERATIONS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'OTHER']);

export function normalizeHttpMethod(method: string): string {
  const normalized = (method || '').toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : 'OTHER';
}

/** Route labels must be route templates (or a bounded fallback), never URLs/IDs. */
export function normalizeRoute(route: string): string {
  if (!route || route.length > 200 || !route.startsWith('/')) return 'unmatched';
  const path = route.split(/[?#]/, 1)[0];
  if (!path || /%[0-9a-f]{2}/i.test(path)) return 'unmatched';
  return path
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (segment.startsWith(':')) return ':param';
      if (/^[0-9]+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':param';
      return segment;
    })
    .join('/');
}

export function normalizeStatusCode(statusCode: number): number {
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
    ? statusCode
    : 500;
}

export function normalizeDbOperation(operation: string): string {
  const candidate = (operation || '').toUpperCase();
  return DB_OPERATIONS.has(candidate) ? candidate : 'OTHER';
}
