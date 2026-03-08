import { Injectable } from '@nestjs/common';

@Injectable()
export class XlmPriceService {
  async getXlmUsdRate(): Promise<number> {
    // Mock implementation - in real app, fetch from API like CoinGecko
    return 0.12;
  }
}
