import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { redisConfig, getRedisUrl } from '../../config/redis.config';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class ActivityTrackerInterceptor implements NestInterceptor {
  private readonly redis: Redis;
  private readonly logger = new Logger(ActivityTrackerInterceptor.name);
  private readonly DEBOUNCE_TIME = 5 * 60; // 5 minutes in seconds
  private readonly REDIS_KEY_PREFIX = 'activity:';

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config));
  }

  /**
   * Debounced last-activity tracking for authenticated users.
   *
   * When the request carries a user with an `id`, schedules a non-blocking
   * update of that user's `lastActiveAt` (Redis-debounced to at most once per
   * {@link ActivityTrackerInterceptor.DEBOUNCE_TIME} seconds). Always continues
   * the handler chain regardless of tracking outcome.
   *
   * @param context - Nest execution context used to read `request.user`
   * @param next - Call handler for the remainder of the interceptor/pipe chain
   * @returns Observable of the downstream handler result
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.id) {
      this.trackActivity(user.id).catch((err) => {
        this.logger.error(
          `Failed to track activity for user ${user.id}: ${err.message}`,
        );
      });
    }

    return next.handle();
  }

  private async trackActivity(userId: string): Promise<void> {
    const key = `${this.REDIS_KEY_PREFIX}${userId}`;

    // Check if we recently updated the activity
    const exists = await this.redis.exists(key);

    if (!exists) {
      // Set the key with TTL to debounce further updates
      await this.redis.setex(key, this.DEBOUNCE_TIME, 'active');

      // Update DB (fire and forget handled by trackActivity's catch in intercept)
      await this.usersService.updateLastActiveAt(userId);
      this.logger.debug(`Updated lastActiveAt for user ${userId}`);
    }
  }
}
