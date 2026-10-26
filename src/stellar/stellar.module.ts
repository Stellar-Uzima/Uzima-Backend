import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { XlmPriceService } from './xlm-price.service';
import { PriceFeedService } from './price-feed.service';
import { SorobanAuthService } from './soroban-auth.service';
import { StellarResilienceService } from './stellar-resilience.service';
import { ResilienceModule } from '../shared/resilience/resilience.module';

@Module({
  imports: [ResilienceModule],
  controllers: [StellarController],
  providers: [StellarService, PriceFeedService, XlmPriceService, SorobanAuthService, StellarResilienceService],
  exports: [StellarService, PriceFeedService, XlmPriceService, SorobanAuthService],
})
export class StellarModule {}