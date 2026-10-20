import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { StellarAccountLinkService } from './stellar-account-link.service';
import { StellarAccountLinkController } from './stellar-account-link.controller';
import { StellarTransactionTrackingService } from './stellar-transaction-tracking.service';
import { StellarTransactionController } from './stellar-transaction.controller';
import { StellarReconciliationService } from './stellar-reconciliation.service';
import { XlmPriceService } from './xlm-price.service';
import { PriceFeedService } from './price-feed.service';
import { SorobanAuthService } from './soroban-auth.service';
import { ResilienceModule } from '../shared/resilience/resilience.module';

@Module({
  imports: [ResilienceModule],
  controllers: [
    StellarAccountLinkController,
    StellarTransactionController,
    StellarController,
  ],
  providers: [
    StellarService,
    StellarAccountLinkService,
    StellarTransactionTrackingService,
    StellarReconciliationService,
    PriceFeedService,
    XlmPriceService,
    SorobanAuthService,
  ],
  exports: [StellarService, PriceFeedService, XlmPriceService, SorobanAuthService],
})
export class StellarModule {}
