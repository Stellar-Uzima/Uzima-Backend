import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // Skip logging for health endpoint
    if (req.originalUrl === '/health') {
      return next();
    }

    const { method, originalUrl } = req;
    const startTime = Date.now();

    const logger = this.logger;

    // Store original end function
    const originalEnd = res.end;

    // Override response end to capture status and log
    res.end = function (this: Response, ...args: any[]) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Determine log level based on status code
      let logLevel: 'log' | 'warn' | 'error' = 'log';
      if (statusCode >= 500) {
        logLevel = 'error';
      } else if (statusCode >= 400) {
        logLevel = 'warn';
      }

      // Format the log message
      const logMessage = `${method} ${originalUrl} → ${statusCode} in ${duration}ms`;

      // Log with appropriate level using the correct context
      switch (logLevel) {
        case 'error':
          logger.error(logMessage);
          break;
        case 'warn':
          logger.warn(logMessage);
          break;
        default:
          logger.log(logMessage);
          break;
      }

      // Call original end function with proper context
      return originalEnd.apply(this, args);
    };

    next();
  }
}
