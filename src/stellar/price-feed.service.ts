import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CacheService } from '../shared/cache/cache.service';

export const XLM_USD_CACHE_KEY = 'xlm:usd:price';
export const XLM_USD_CACHE_TTL_SECONDS = 300; // 5 minutes

export interface XlmPriceSnapshot {
  priceUsd: number;
  source: 'coingecko' | 'stellar-dex' | 'cache';
  fetchedAt: string;
}

@Injectable()
export class PriceFeedService {
  private readonly logger = new Logger(PriceFeedService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  async getXlmUsdPrice(): Promise<XlmPriceSnapshot> {
    return this.cacheService.rememberWithStaleFallback<XlmPriceSnapshot>(
      XLM_USD_CACHE_KEY,
      () => this.fetchFromProviders(),
      XLM_USD_CACHE_TTL_SECONDS,
    );
  }

  private async fetchFromProviders(): Promise<XlmPriceSnapshot> {
    try {
      return await this.fetchFromCoinGecko();
    } catch (coinGeckoError) {
      this.logger.warn(
        `CoinGecko fetch failed: ${(coinGeckoError as Error).message}`,
      );
    }

    try {
      return await this.fetchFromStellarDex();
    } catch (dexError) {
      this.logger.warn(
        `Stellar DEX fetch failed: ${(dexError as Error).message}`,
      );
      throw new Error('All XLM price providers unavailable');
    }
  }

  private async fetchFromCoinGecko(): Promise<XlmPriceSnapshot> {
    const url =
      this.configService.get<string>('XLM_PRICE_COINGECKO_URL') ??
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd';

    const { data } = await axios.get<{ stellar?: { usd?: number } }>(url, {
      timeout: 8000,
    });

    const priceUsd = data?.stellar?.usd;
    if (priceUsd == null || priceUsd <= 0) {
      throw new Error('Invalid CoinGecko price response');
    }

    return {
      priceUsd,
      source: 'coingecko',
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchFromStellarDex(): Promise<XlmPriceSnapshot> {
    const horizonUrl =
      this.configService.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon.stellar.org';

    const usdcIssuer =
      this.configService.get<string>('STELLAR_USDC_ISSUER') ??
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX5IHOJWJ3K4MHH7DTRVN';

    const { data } = await axios.get<{
      bids: Array<{ price_r: string }>;
      asks: Array<{ price_r: string }>;
    }>(
      `${horizonUrl}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${usdcIssuer}&limit=1`,
      { timeout: 8000 },
    );

    const bestBid = data?.bids?.[0]?.price_r;
    const bestAsk = data?.asks?.[0]?.price_r;
    const priceStr = bestBid ?? bestAsk;
    const priceUsd = priceStr ? parseFloat(priceStr) : NaN;

    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      throw new Error('Invalid Stellar DEX price response');
    }

    return {
      priceUsd,
      source: 'stellar-dex',
      fetchedAt: new Date().toISOString(),
    };
  }
}
