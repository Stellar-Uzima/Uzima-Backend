import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { MetricsModule } from '../metrics/metrics.module';
import { MonitoringInterceptor } from '../../common/interceptors/monitoring.interceptor';

@Module({
  imports: [MetricsModule],
  providers: [MonitoringService, MonitoringInterceptor],
  exports: [MonitoringService, MonitoringInterceptor],
})
export class MonitoringModule {}