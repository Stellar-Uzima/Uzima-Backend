import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { getRedisUrl, redisConfig } from '../../config/redis.config';

export interface RateLimiterOverrides {
  userLimit?: number;
  userWindowSeconds?: number;
  ipLimit?: number;
  ipWindowSeconds?: number;
}

export interface RateLimitStatus {
  key: string;
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  ttl: number;
  type: 'user' | 'ip';
}

export interface RateLimiterTarget {
  userId?: string;
  ip?: string;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly userLimit: number;
  private readonly userWindowSeconds: number;
  private readonly ipLimit: number;
  private readonly ipWindowSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const config = redisConfig(configService);
    const redisUrl = getRedisUrl(config);

    try {
      this.redis = new Redis(redisUrl);
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection for rate limiter', error as Error);
      throw new InternalServerErrorException('Rate limiter initialization failed');
    }

    this.keyPrefix = configService.get<string>('RATE_LIMIT_KEY_PREFIX', 'rate_limit');
    this.userLimit = this.parsePositiveInt(configService.get<string>('RATE_LIMIT_USER_LIMIT'), 100);
    this.userWindowSeconds = this.parsePositiveInt(
      configService.get<string>('RATE_LIMIT_USER_WINDOW_SECONDS'),
      60,
    );
    this.ipLimit = this.parsePositiveInt(configService.get<string>('RATE_LIMIT_IP_LIMIT'), 50);
    this.ipWindowSeconds = this.parsePositiveInt(
      configService.get<string>('RATE_LIMIT_IP_WINDOW_SECONDS'),
      60,
    );
  }

  async consumeUser(
    userId: string,
    overrides: RateLimiterOverrides = {},
  ): Promise<RateLimitStatus> {
    return this.consumeSingle('user', userId, {
      limit: overrides.userLimit ?? this.userLimit,
      windowSeconds: overrides.userWindowSeconds ?? this.userWindowSeconds,
    });
  }

  async consumeIp(ip: string, overrides: RateLimiterOverrides = {}): Promise<RateLimitStatus> {
    return this.consumeSingle('ip', ip, {
      limit: overrides.ipLimit ?? this.ipLimit,
      windowSeconds: overrides.ipWindowSeconds ?? this.ipWindowSeconds,
    });
  }

  async consume(
    target: RateLimiterTarget,
    overrides: RateLimiterOverrides = {},
  ): Promise<RateLimitStatus[]> {
    const results: RateLimitStatus[] = [];

    if (target.userId) {
      results.push(await this.consumeUser(target.userId, overrides));
    }

    if (target.ip) {
      results.push(await this.consumeIp(target.ip, overrides));
    }

    return results;
  }

  async isBlocked(target: RateLimiterTarget, overrides: RateLimiterOverrides = {}): Promise<boolean> {
    const statuses = await this.consume(target, overrides);
    return statuses.some((status) => !status.allowed);
  }

  private async consumeSingle(
    type: 'user' | 'ip',
    identifier: string,
    options: { limit: number; windowSeconds: number },
  ): Promise<RateLimitStatus> {
    const key = this.buildKey(type, identifier);
    const { current, ttl } = await this.incrementKey(key, options.windowSeconds);
    const allowed = current <= options.limit;

    return {
      key,
      allowed,
      current,
      limit: options.limit,
      remaining: Math.max(options.limit - current, 0),
      ttl,
      type,
    };
  }

  private buildKey(type: 'user' | 'ip', identifier: string): string {
    return `${this.keyPrefix}:${type}:${identifier}`;
  }

  private async incrementKey(
    key: string,
    windowSeconds: number,
  ): Promise<{ current: number; ttl: number }> {
    try {
      const current = await this.redis.incr(key);

      if (current === 1) {
        await this.redis.expire(key, windowSeconds);
      } else {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          await this.redis.expire(key, windowSeconds);
        }
      }

      const ttl = await this.redis.ttl(key);
      return {
        current,
        ttl: ttl < 0 ? windowSeconds : ttl,
      };
    } catch (error) {
      this.logger.error(`Redis rate limit increment failed for key=${key}`, error as Error);
      throw new InternalServerErrorException('Rate limiting is unavailable');
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
