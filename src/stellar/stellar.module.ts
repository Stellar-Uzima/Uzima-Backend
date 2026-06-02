import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { XlmPriceService } from './xlm-price.service';
import { PriceFeedService } from './price-feed.service';

@Module({
  controllers: [StellarController],
  providers: [StellarService, PriceFeedService, XlmPriceService],
  exports: [StellarService, PriceFeedService, XlmPriceService],
})
export class StellarModule {}
