import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLog } from '../../database/entities/request-log.entity';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    @InjectRepository(RequestLog)
    private readonly requestLogRepository: Repository<RequestLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const { method, url, headers, body, ip } = request;
    const userAgent = headers['user-agent'];

    // Mask sensitive data
    const maskedHeaders = this.maskSensitiveData(headers);
    const maskedBody = this.maskSensitiveData(body);

    this.logger.log(`${method} ${url} - ${ip}`);

    return next.handle().pipe(
      tap(async (responseData) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = response.statusCode;

        // Log successful response
        this.logger.log(
          `${method} ${url} - ${statusCode} - ${responseTime}ms`,
        );

        // Store log in database
        await this.storeLog({
          method,
          path: url,
          headers: maskedHeaders,
          body: maskedBody,
          userAgent,
          ip,
          userId: this.extractUserId(request),
          statusCode,
          response: this.maskSensitiveData(responseData),
          responseTime,
        });
      }),
      catchError(async (error) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = error.status || 500;

        // Log error response
        this.logger.error(
          `${method} ${url} - ${statusCode} - ${responseTime}ms - ${error.message}`,
        );

        // Store error log in database
        await this.storeLog({
          method,
          path: url,
          headers: maskedHeaders,
          body: maskedBody,
          userAgent,
          ip,
          userId: this.extractUserId(request),
          statusCode,
          response: null,
          responseTime,
          error: error.message,
        });

        throw error;
      }),
    );
  }

  private maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'session',
      'creditCard',
      'ssn',
      'apiKey',
    ];

    const masked = { ...data };

    for (const field of sensitiveFields) {
      if (masked[field]) {
        masked[field] = '***MASKED***';
      }
    }

    // Recursively mask nested objects
    for (const key in masked) {
      if (typeof masked[key] === 'object' && masked[key] !== null) {
        masked[key] = this.maskSensitiveData(masked[key]);
      }
    }

    return masked;
  }

  private extractUserId(request: Request): string | undefined {
    // Try to extract user ID from JWT token or session
    const user = (request as any).user;
    return user?.id || user?.sub;
  }

  private async storeLog(logData: Partial<RequestLog>): Promise<void> {
    try {
      const log = this.requestLogRepository.create(logData);
      await this.requestLogRepository.save(log);
    } catch (error) {
      // Don't let logging errors break the application
      this.logger.error('Failed to store request log:', error);
    }
  }
}
