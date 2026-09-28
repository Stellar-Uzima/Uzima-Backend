import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UxDegradationEvent } from './entities/ux-degradation-event.entity';
import { UxHealthMonitorService } from './ux-health-monitor.service';
import { UxMonitoringScheduler } from './ux-monitoring.scheduler';
import { UxMonitoringController } from './ux-monitoring.controller';

/**
 * Wires up UX-degradation monitoring. The `@Cron` sweep runs because
 * `ScheduleModule.forRoot()` is enabled globally, and the service is exported
 * so the global `MonitoringModule` can feed every observed request into it.
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([UxDegradationEvent])],
  controllers: [UxMonitoringController],
  providers: [UxHealthMonitorService, UxMonitoringScheduler],
  exports: [UxHealthMonitorService],
})
export class UxMonitoringModule {}