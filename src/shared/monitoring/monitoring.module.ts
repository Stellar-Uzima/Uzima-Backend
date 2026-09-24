import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { MetricsModule } from '../metrics/metrics.module';
import { MonitoringInterceptor } from '../../common/interceptors/monitoring.interceptor';
import { UxMonitoringModule } from '../../modules/ux-monitoring/ux-monitoring.module';

@Module({
  imports: [MetricsModule, UxMonitoringModule],
  providers: [MonitoringService, MonitoringInterceptor],
  exports: [MonitoringService, MonitoringInterceptor],
})
export class MonitoringModule {}