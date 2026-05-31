import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Holds per-request tracing data propagated via AsyncLocalStorage.
 * Available anywhere in the call chain without passing it explicitly.
 */
export interface RequestContext {
  /** Unique ID for this request (UUID v4 or value of incoming X-Request-ID header). */
  requestId: string;
  /** Authenticated user ID, set after JWT validation. */
  userId?: string;
  /** HTTP method, e.g. GET / POST. */
  method?: string;
  /** Request path, e.g. /api/users. */
  path?: string;
  /** Unix epoch ms when the request was received. */
  startTime: number;
}

/**
 * Issue #667 — Request context store backed by Node.js AsyncLocalStorage.
 *
 * Middleware sets the context at the start of every request.  Services can
 * read it at any point in the same async call chain via `getContext()` /
 * `getRequestId()` / `getUserId()`.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  /** Run `fn` inside a fresh context initialised with `context`. */
  run<T>(context: RequestContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /** Return the active context, or `undefined` outside a request. */
  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /** Convenience: return the request ID, or `'no-request-id'` outside a request. */
  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? 'no-request-id';
  }

  /** Convenience: return the authenticated user ID if set. */
  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  /**
   * Set the authenticated user ID on the active context.
   * Called by guards/interceptors once the JWT is validated.
   */
  setUserId(userId: string): void {
    const ctx = this.storage.getStore();
    if (ctx) {
      ctx.userId = userId;
    }
  }
}