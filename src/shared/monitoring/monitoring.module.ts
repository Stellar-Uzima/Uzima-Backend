import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { MonitoringInterceptor } from '../../common/interceptors/monitoring.interceptor';

@Module({
  imports: [MetricsModule, NotificationsModule],
  providers: [MonitoringService, MonitoringInterceptor],
  exports: [MonitoringService, MonitoringInterceptor],
})
export class MonitoringModule {}