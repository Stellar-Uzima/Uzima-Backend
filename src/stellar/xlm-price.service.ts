import { Injectable } from '@nestjs/common';
import { PriceFeedService } from './price-feed.service';

@Injectable()
export class XlmPriceService {
  constructor(private readonly priceFeedService: PriceFeedService) {}

  async getXlmUsdRate(): Promise<number> {
    const snapshot = await this.priceFeedService.getXlmUsdPrice();
    return snapshot.priceUsd;
  }
}
