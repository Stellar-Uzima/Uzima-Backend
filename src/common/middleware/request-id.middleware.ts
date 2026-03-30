import { Injectable, NestMiddleware, Scope } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

export interface RequestIdStore {
  requestId: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestIdStore>();

@Injectable({ scope: Scope.DEFAULT })
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Store request ID in AsyncLocalStorage for access anywhere in the request lifecycle
    asyncLocalStorage.run({ requestId }, () => {
      // Attach to request object for backward compatibility
      req.headers['x-request-id'] = requestId;

      // Set response header so clients can correlate
      res.setHeader('x-request-id', requestId);

      next();
    });
  }
}
