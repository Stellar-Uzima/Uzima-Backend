import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly httpRequestsTotal: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly httpRequestDuration: Histogram<string>,
    @InjectMetric('database_queries_total')
    private readonly dbQueriesTotal: Counter<string>,
    @InjectMetric('database_query_duration_seconds')
    private readonly dbQueryDuration: Histogram<string>,
    @InjectMetric('cache_hits_total')
    private readonly cacheHitsTotal: Counter<string>,
    @InjectMetric('cache_misses_total')
    private readonly cacheMissesTotal: Counter<string>,
    @InjectMetric('system_memory_usage_bytes')
    private readonly memoryUsage: Gauge<string>,
    @InjectMetric('system_cpu_usage_percent')
    private readonly cpuUsage: Gauge<string>,
  ) {}

  // Request metrics
  incrementHttpRequests(method: string, route: string, statusCode: number) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  }

  recordHttpRequestDuration(method: string, route: string, duration: number) {
    this.httpRequestDuration.observe({ method, route }, duration);
  }

  // Database metrics
  incrementDbQueries(operation: string) {
    this.dbQueriesTotal.inc({ operation });
  }

  recordDbQueryDuration(operation: string, duration: number) {
    this.dbQueryDuration.observe({ operation }, duration);
  }

  // Cache metrics
  incrementCacheHits() {
    this.cacheHitsTotal.inc();
  }

  incrementCacheMisses() {
    this.cacheMissesTotal.inc();
  }

  // System metrics
  setMemoryUsage(bytes: number) {
    this.memoryUsage.set(bytes);
  }

  setCpuUsage(percent: number) {
    this.cpuUsage.set(percent);
  }
}