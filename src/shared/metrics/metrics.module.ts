import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';
import { MonitoringController } from '../monitoring/monitoring.controller';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      controller: MonitoringController,
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    }),
    makeCounterProvider({
      name: 'http_requests_success_total',
      help: 'Total number of successful HTTP requests',
      labelNames: ['method', 'route'],
    }),
    makeCounterProvider({
      name: 'http_requests_failed_total',
      help: 'Total number of failed HTTP requests (4xx/5xx)',
      labelNames: ['method', 'route', 'status_code'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    }),
    makeCounterProvider({
      name: 'database_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation'],
    }),
    makeCounterProvider({
      name: 'database_slow_queries_total',
      help: 'Number of database queries exceeding the configured slow-query threshold',
      labelNames: ['operation'],
    }),
    makeHistogramProvider({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    }),
    makeCounterProvider({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_name'],
    }),
    makeCounterProvider({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_name'],
    }),
    makeCounterProvider({
      name: 'notification_deliveries_total',
      help: 'Notification provider delivery attempts by channel and outcome',
      labelNames: ['channel', 'outcome'],
    }),
    makeCounterProvider({
      name: 'notification_delivery_retries_total',
      help: 'Notification delivery retries enqueued by channel',
      labelNames: ['channel'],
    }),
    makeGaugeProvider({
      name: 'notification_provider_circuit_state',
      help: 'Notification provider circuit state (1=open, 0=closed)',
      labelNames: ['channel'],
    }),
    makeCounterProvider({
      name: 'notification_delivery_status_transitions_total',
      help: 'Delivery status state transitions (pending, sent, failed, escalated) by channel',
      labelNames: ['channel', 'status', 'previous_status'],
    }),
    makeGaugeProvider({
      name: 'notification_delivery_status_distribution',
      help: 'Distribution of notifications by delivery status and channel',
      labelNames: ['channel', 'status'],
    }),
    makeHistogramProvider({
      name: 'notification_delivery_time_seconds',
      help: 'Time from notification creation to successful delivery by channel (in seconds)',
      labelNames: ['channel'],
      buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
    }),
    makeCounterProvider({
      name: 'notification_delivery_escalations_total',
      help: 'Number of notifications escalated for operational review by reason',
      labelNames: ['reason'],
    }),
    makeGaugeProvider({
      name: 'system_memory_usage_bytes',
      help: 'Current memory usage in bytes',
    }),
    makeGaugeProvider({
      name: 'system_cpu_usage_percent',
      help: 'Current CPU usage percentage',
    }),
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
