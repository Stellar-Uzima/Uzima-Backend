import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as winston from 'winston';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const requestId = meta.requestId ? ` [${meta.requestId}]` : '';
              return `${timestamp} ${level}:${requestId} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            }),
          ),
        }),
      ],
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, body } = req;
    
    // Skip logging for health endpoint
    if (originalUrl === '/health' || originalUrl.includes('/health')) {
      return next();
    }

    const startTime = Date.now();
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    
    // Set request ID in headers for tracing
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    // Calculate request body size
    const bodySize = body ? Buffer.byteLength(JSON.stringify(body)) : 0;

    // Handle response finish event
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      // Redact body for auth endpoints
      const isAuthRoute = originalUrl.includes('/auth');
      const safeBody = isAuthRoute ? '[REDACTED]' : body;

      const logData = {
        method,
        path: originalUrl,
        statusCode,
        duration: `${duration}ms`,
        bodySize: `${bodySize} bytes`,
        requestId,
        body: safeBody,
      };

      const message = `${method} ${originalUrl} ${statusCode} - ${duration}ms`;

      if (statusCode >= 500) {
        this.logger.error(message, logData);
      } else if (statusCode >= 400) {
        this.logger.warn(message, logData);
      } else {
        this.logger.info(message, logData);
      }
    });

    next();
  }
}
