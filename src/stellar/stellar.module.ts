import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { XlmPriceService } from './xlm-price.service';

@Module({
  controllers: [StellarController],
  providers: [StellarService, XlmPriceService],
  exports: [StellarService, XlmPriceService],
})
export class StellarModule {}
