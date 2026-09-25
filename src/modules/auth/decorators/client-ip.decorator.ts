import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Resolves the caller's IP address for rate limiting and lockout bookkeeping.
 *
 * `X-Forwarded-For` is only consulted when the app is explicitly configured to
 * trust a proxy (`TRUST_PROXY=true`). Trusting it unconditionally would let any
 * caller defeat the per-IP throttle in #1286 by sending a single
 * `X-Forwarded-For` header per request — the header would be the only thing the
 * limiter ever saw.
 *
 * When the header is *not* trusted, a forwarded value is deliberately ignored
 * rather than parsed, so the limiter keys on the socket address.
 */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();

  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = header?.split(',')[0]?.trim();
    if (first) {
      return normaliseIp(first);
    }
  }

  return normaliseIp(request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0');
});

/** Strips the IPv4-mapped IPv6 prefix so `::ffff:1.2.3.4` and `1.2.3.4` share a counter. */
function normaliseIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped ? mapped[1] : ip;
}

/** Same resolution as {@link ClientIp}, but callable from a service. */
export function resolveClientIp(request: Request): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = header?.split(',')[0]?.trim();
    if (first) {
      return normaliseIp(first);
    }
  }

  const ip = normaliseIp(request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0');
  if (!ip) {
    throw new BadRequestException('Could not determine client IP address');
  }
  return ip;
}
