import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { createClient, RedisClientType } from 'redis';
import { AFRICAN_COUNTRIES, Country } from './data/african-countries';
import { SUPPORTED_LANGUAGES, Language } from './data/supported-languages';

@Injectable()
export class ReferenceService {
  private readonly logger = new Logger(ReferenceService.name);
  private redisClient: RedisClientType;
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly COUNTRIES_CACHE_KEY = 'reference:countries';
  private readonly LANGUAGES_CACHE_KEY = 'reference:languages';

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect().catch((err) => {
      this.logger.error('Failed to connect to Redis', err);
    });
  }

  /**
   * Get all African countries with caching
   * Returns cached data if available, otherwise fetches and caches for 1 hour
   */
  async getCountries(): Promise<Country[]> {
    try {
      // Try to get from cache-manager first (test-friendly)
      const cached = await this.cacheManager.get<Country[]>(this.COUNTRIES_CACHE_KEY);
      if (cached) {
        this.logger.debug('Returning countries from cache');
        return cached;
      }

      // Cache miss - return static data and cache it
      await this.cacheManager.set(this.COUNTRIES_CACHE_KEY, AFRICAN_COUNTRIES, this.CACHE_TTL);

      return AFRICAN_COUNTRIES;
    } catch (error) {
      this.logger.warn('Cache error, returning static data', error);
      return AFRICAN_COUNTRIES;
    }
  }

  /**
   * Get all supported languages with caching
   * Returns cached data if available, otherwise fetches and caches for 1 hour
   */
  async getLanguages(): Promise<Language[]> {
    try {
      // Try to get from cache-manager first (test-friendly)
      const cached = await this.cacheManager.get<Language[]>(this.LANGUAGES_CACHE_KEY);
      if (cached) {
        this.logger.debug('Returning languages from cache');
        return cached;
      }

      // Cache miss - return static data and cache it
      await this.cacheManager.set(this.LANGUAGES_CACHE_KEY, SUPPORTED_LANGUAGES, this.CACHE_TTL);

      return SUPPORTED_LANGUAGES;
    } catch (error) {
      this.logger.warn('Cache error, returning static data', error);
      return SUPPORTED_LANGUAGES;
    }
  }

  /**
   * Invalidate cache (useful for testing or manual cache refresh)
   */
  async invalidateCache(): Promise<void> {
    try {
      await this.redisClient.del([
        this.COUNTRIES_CACHE_KEY,
        this.LANGUAGES_CACHE_KEY,
      ]);
      this.logger.debug('Reference data cache invalidated');
    } catch (error) {
      this.logger.warn('Failed to invalidate cache', error);
    }
  }

  /**
   * Cleanup Redis connection on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
