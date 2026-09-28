import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataQualityReport } from './entities/data-quality-report.entity';
import { DataQualityService } from './data-quality.service';
import { DataQualityScheduler } from './data-quality.scheduler';

/**
 * Wires up the data-quality validation module. The scheduler is registered as
 * a provider; `@nestjs/schedule` is already enabled globally via the shared
 * `SchedulerModule`, so the `@Cron` decorators become active as soon as this
 * module is imported from `AppModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DataQualityReport])],
  providers: [DataQualityService, DataQualityScheduler],
  exports: [DataQualityService, DataQualityScheduler],
})
export class DataQualityModule {}