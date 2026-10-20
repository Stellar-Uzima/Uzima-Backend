import { Module } from '@nestjs/common';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';
import { MetricsModule } from '../shared/metrics/metrics.module';

// Groups the reference data controller and service into a NestJS module.
@Module({
  // Imports MetricsModule so its exported providers, such as MetricsService,
  // can be injected into ReferenceService.
  imports: [MetricsModule],

  // Registers ReferenceController to handle HTTP requests for reference data.
  controllers: [ReferenceController],

  // Registers ReferenceService with NestJS dependency injection.
  providers: [ReferenceService],

  // Makes ReferenceService available for injection into other modules
  // that import ReferenceModule.
  exports: [ReferenceService],
})
export class ReferenceModule {}
