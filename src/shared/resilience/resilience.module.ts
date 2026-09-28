import { Module } from '@nestjs/common';
import { ResilienceService } from './resilience.service';

/**
 * Exposes the resilience/third-party safe-handling primitives for any module
 * that talks to external HTTP endpoints or libraries.
 */
@Module({
  providers: [ResilienceService],
  exports: [ResilienceService],
})
export class ResilienceModule {}