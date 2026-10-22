import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { createHash } from 'crypto';
import { IdempotencyService } from './idempotency.service';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const rawKey = request?.headers?.['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || typeof key !== 'string' || key.trim() === '') {
      return next.handle();
    }

    const method = String(request.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const userId =
      request?.user?.id ||
      request?.user?.sub ||
      request?.user?.userId ||
      null;

    const path = String(request.path || request.url || request.originalUrl || '');
    const requestHash = createHash('sha256')
      .update(
        stableStringify({
          method,
          path,
          query: request.query || {},
          body: request.body || {},
        }),
      )
      .digest('hex');

    const existing = await this.idempotencyService.find(userId, method, path, key);

    const now = new Date();
    if (existing && new Date(existing.expiresAt).getTime() > now.getTime()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key reused with a different request payload',
        );
      }

      response.status(existing.statusCode || 200);
      return of(existing.responseBody);
    }

    if (existing) {
      await this.idempotencyService.deleteById(existing.id);
    }

    const handler = context.getHandler();
    const httpCodeMetadata = Reflect.getMetadata('__httpCode__', handler);
    const statusCode =
      typeof httpCodeMetadata === 'number'
        ? httpCodeMetadata
        : method === 'POST'
          ? 201
          : 200;

    return next.handle().pipe(
      tap(async (data) => {
        const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
        try {
          await this.idempotencyService.save({
            key,
            userId,
            method,
            path,
            requestHash,
            statusCode,
            responseBody: data === undefined ? null : data,
            expiresAt,
          });
        } catch {
        }
      }),
    );
  }
}
