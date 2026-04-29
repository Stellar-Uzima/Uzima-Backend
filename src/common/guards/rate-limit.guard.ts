import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerStorage,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse();
    
    // Set rate limit headers
    response.set('X-RateLimit-Limit', throttlerLimitDetail.limit.toString());
    response.set('X-RateLimit-Remaining', '0');
    response.set('Retry-After', throttlerLimitDetail.ttl.toString());
    
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
