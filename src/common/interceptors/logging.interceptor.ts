import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLog } from '../../database/entities/request-log.entity';
import { CustomLogger } from '../../shared/logging/logger.service';
import {
  redactSensitiveFields,
  redactSensitiveText,
} from '../utils/log-redactor.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(RequestLog)
    private readonly requestLogRepository: Repository<RequestLog>,
    private readonly logger: CustomLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const { method, url, headers, body, ip } = request;
    const userAgent = headers['user-agent'];
    const requestId = (request as any).requestId;
    const userId = this.extractUserId(request);

    // Mask sensitive data
    const maskedHeaders = redactSensitiveFields(headers as Record<string, unknown>);
    const maskedBody = body
      ? redactSensitiveFields(body as Record<string, unknown>)
      : body;

    this.logger.logApiRequest(method, url, userId, requestId, { ip, userAgent });

    return next.handle().pipe(
      tap(async (responseData) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = response.statusCode;

        this.logger.log(
          `${method} ${url} - ${statusCode} - ${responseTime}ms`,
          'HTTP',
          { requestId, userId, responseTime, statusCode },
        );

        await this.storeLog({
          method,
          path: redactSensitiveText(url),
          headers: maskedHeaders,
          body: maskedBody,
          userAgent,
          ip,
          userId,
          requestId,
          statusCode,
          response:
            typeof responseData === 'string'
              ? redactSensitiveText(responseData)
              : responseData && typeof responseData === 'object'
                ? redactSensitiveFields(
                    responseData as Record<string, unknown>,
                  )
                : responseData,
          responseTime,
        });
      }),
      catchError(async (error) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = error.status || 500;

        this.logger.logApiError(method, url, error, userId, requestId, {
          responseTime,
          statusCode,
        });

        await this.storeLog({
          method,
          path: redactSensitiveText(url),
          headers: maskedHeaders,
          body: maskedBody,
          userAgent,
          ip,
          userId,
          requestId,
          statusCode,
          response: undefined,
          responseTime,
          error: redactSensitiveText(error.message),
        });

        throw error;
      }),
    );
  }

  private extractUserId(request: Request): string | undefined {
    const user = (request as any).user;
    return user?.id || user?.sub;
  }

  private async storeLog(logData: Partial<RequestLog>): Promise<void> {
    try {
      const log = this.requestLogRepository.create(logData);
      await this.requestLogRepository.save(log);
    } catch (error) {
      this.logger.error('Failed to store request log:', error);
    }
  }
}
