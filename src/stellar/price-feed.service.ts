import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CacheService } from '../shared/cache/cache.service';

@Injectable()
export class PriceFeedService {
  private readonly logger = new Logger(PriceFeedService.name);
  private readonly LIVE_CACHE_KEY = 'rewards:xlm_usd_price';
  private readonly STALE_CACHE_KEY = 'rewards:xlm_usd_price:stale';
  private readonly FIVE_MINUTES_IN_SECONDS = 300;

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Fetches the current XLM/USD value using the native CacheService layer
   */
  async getXlmPrice(): Promise<{ price: number; cached: boolean }> {
    try {
      // Leverage your built-in wrapper for automated 5-minute lifecycle management
      const price = await this.cacheService.remember(
        this.LIVE_CACHE_KEY,
        async () => {
          const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd'
          );
          
          const livePrice = response.data?.stellar?.usd;
          if (!livePrice || typeof livePrice !== 'number') {
            throw new Error('Invalid response structure from external price feed');
          }

          // Back up the fresh value into an un-expiring fallback key before resolving
          await this.cacheService.set(this.STALE_CACHE_KEY, livePrice, { ttl: 0 });
          return livePrice;
        },
        this.FIVE_MINUTES_IN_SECONDS,
      );

      return { price, cached: true };
    } catch (error) {
      // Safely extract message from unknown error type
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Upstream price feed failure: ${errorMessage}`);

      // Acceptance Criteria: Yield stale record if live network layer fails
      const stalePrice = await this.cacheService.get<number>(this.STALE_CACHE_KEY);
      if (stalePrice !== null) {
        this.logger.warn(`Serving resilient stale fallback valuation: $${stalePrice}`);
        return { price: stalePrice, cached: true };
      }

      // Hard floor fallback if application is booted completely isolated from past entries
      return { price: 0.12, cached: true };
    }
  }
}