import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestContextService } from './request-context.service';

/**
 * Issue #667 — Request-ID middleware.
 *
 * For every incoming HTTP request this middleware:
 *  1. Reads the `X-Request-ID` header (if sent by a gateway/client) or generates a new UUID v4.
 *  2. Echoes the ID back in the `X-Request-ID` response header.
 *  3. Stores it on `req` so downstream code can access it without injecting the context service.
 *  4. Wraps the rest of the request lifecycle in an `AsyncLocalStorage` context so that
 *     `RequestContextService.getRequestId()` / `getUserId()` work anywhere in the call chain.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Honour an existing ID from a reverse-proxy / API gateway, otherwise mint one.
    const requestId =
      (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID();

    // Make it available on the raw request object (compatible with existing middleware).
    (req as any).requestId = requestId;

    // Echo back so clients / gateways can correlate responses to requests.
    res.setHeader('X-Request-ID', requestId);

    // Run the remainder of the request chain inside the AsyncLocalStorage context.
    this.requestContext.run(
      {
        requestId,
        method: req.method,
        path: req.path,
        startTime: Date.now(),
      },
      () => next(),
    );
  }
}