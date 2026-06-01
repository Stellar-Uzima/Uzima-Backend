import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import * as os from 'os';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(private readonly metricsService: MetricsService) {
    this.startSystemMonitoring();
  }

  private startSystemMonitoring() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000);
  }

  private collectSystemMetrics() {
    const memUsage = process.memoryUsage().heapUsed;
    this.metricsService.setMemoryUsage(memUsage);

    const cpuUsage = (os.loadavg()[0] / os.cpus().length) * 100;
    this.metricsService.setCpuUsage(cpuUsage);

    if (memUsage > 500 * 1024 * 1024) {
      this.alert('High Memory Usage', `Memory usage is ${Math.round(memUsage / 1024 / 1024)}MB`);
    }

    if (cpuUsage > 80) {
      this.alert('High CPU Usage', `CPU usage is ${cpuUsage.toFixed(2)}%`);
    }
  }

  async monitorPerformance(route: string, method: string, duration: number, statusCode: number) {
    this.metricsService.incrementHttpRequests(method, route, statusCode);
    this.metricsService.recordHttpRequestDuration(method, route, duration / 1000);

    if (duration > 5000) {
      this.alert('Slow Request', `Request to ${method} ${route} took ${duration}ms`);
    }
  }

  async monitorDatabase(operation: string, duration: number) {
    this.metricsService.incrementDbQueries(operation);
    this.metricsService.recordDbQueryDuration(operation, duration / 1000);

    if (duration > 1000) {
      this.alert('Slow Database Query', `Query ${operation} took ${duration}ms`);
    }
  }

  private alert(title: string, message: string) {
    this.logger.warn(`${title}: ${message}`);
  }

  getMetrics() {
    return { message: 'Metrics available at /metrics' };
  }
}
