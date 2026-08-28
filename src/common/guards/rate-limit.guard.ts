import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Guard that throttles incoming requests based on the client's real IP address.
 * Extracts the IP from proxy headers (X-Forwarded-For, X-Real-IP) or falls back
 * to the socket remote address. Denies access with HTTP 429 when the request
 * threshold is exceeded within the configured time window.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  /**
   * Override to extract the real client IP from various headers (X-Forwarded-For, X-Real-IP)
   * This ensures accurate rate limiting even when behind proxies/load balancers
   */
  protected getTracker(req: Record<string, any>): string {
    const request = req as Request;
    
    // Get real IP from common proxy headers
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor) ? xForwardedFor : xForwardedFor.split(',');
      return ips[0].trim();
    }
    
    const xRealIp = request.headers['x-real-ip'];
    if (xRealIp) {
      return typeof xRealIp === 'string' ? xRealIp : xRealIp[0];
    }
    
    // Fallback to connection remote address
    return request.socket?.remoteAddress || request.ip || 'unknown';
  }

  protected async handleRequest(
    requestProps: Parameters<ThrottlerGuard['handleRequest']>[0],
  ): Promise<boolean> {
    const allowed = await super.handleRequest(requestProps);
    const { context, limit, ttl } = requestProps;
    const response = context.switchToHttp().getResponse();
    
    // Calculate correct remaining requests
    const tracker = this.getTracker(context.switchToHttp().getRequest());
    const key = this.generateKey(context, tracker, 'default');
    const { totalHits } = await this.storageService.getRecord(key);
    const remaining = Math.max(0, limit - totalHits);
    
    response.set('X-RateLimit-Limit', limit.toString());
    response.set('X-RateLimit-Remaining', remaining.toString());
    response.set('X-RateLimit-Reset', Math.ceil(ttl / 1000).toString());
    return allowed;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse();
    
    // Set proper rate limit headers
    response.set('X-RateLimit-Limit', throttlerLimitDetail.limit.toString());
    response.set('X-RateLimit-Remaining', '0');
    response.set('Retry-After', Math.ceil(throttlerLimitDetail.ttl / 1000).toString());
    response.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + throttlerLimitDetail.ttl / 1000).toString());
    
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too Many Requests',
        error: 'Rate limit exceeded. Please try again later.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}