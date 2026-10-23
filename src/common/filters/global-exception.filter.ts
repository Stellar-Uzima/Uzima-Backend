import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

export enum SmsFailureClass {
  RETRYABLE = 'RETRYABLE',
  TERMINAL = 'TERMINAL',
}

export class SmsProviderError extends Error {
  constructor(
    message: string,
    public readonly failureClass: SmsFailureClass,
    public readonly providerStatus?: number,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'SmsProviderError';
  }
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TERMINAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);

export function classifySmsProviderResponse(
  status: number | undefined,
  providerCode?: string,
): SmsFailureClass {
  if (status === undefined) {
    return SmsFailureClass.RETRYABLE;
  }
  if (RETRYABLE_HTTP_STATUSES.has(status)) {
    return SmsFailureClass.RETRYABLE;
  }
  if (TERMINAL_HTTP_STATUSES.has(status)) {
    return SmsFailureClass.TERMINAL;
  }
  if (status >= 500) {
    return SmsFailureClass.RETRYABLE;
  }
  return SmsFailureClass.TERMINAL;
}

export function isSmsTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED'
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId = randomUUID();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof SmsProviderError) {
      const failureClass = exception.failureClass;
      this.logger.error(
        `SMS provider failure [traceId=${traceId}] class=${failureClass} providerStatus=${exception.providerStatus ?? 'n/a'} providerCode=${exception.providerCode ?? 'n/a'} path=${request.url}: ${exception.message}`,
        exception.stack,
      );
      const retryable = failureClass === SmsFailureClass.RETRYABLE;
      response.status(retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY).json({
        statusCode: retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
        error: retryable ? 'SMS Temporarily Unavailable' : 'SMS Delivery Failed',
        message: retryable
          ? 'We could not send your verification code right now. Please try again shortly.'
          : 'We could not send your verification code. Please check your number or contact support.',
        retryable,
        traceId,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    if (isSmsTimeoutError(exception)) {
      this.logger.error(
        `SMS provider timeout [traceId=${traceId}] path=${request.url}: ${(exception as Error).message}`,
        (exception as Error).stack,
      );
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'SMS Temporarily Unavailable',
        message: 'We could not send your verification code right now. Please try again shortly.',
        retryable: true,
        traceId,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) || message;
        error = (res.error as string) || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`[traceId=${traceId}] ${exception.message}`, exception.stack);
    }

    if (statusCode >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(`[traceId=${traceId}] unhandled exception path=${request.url}`);
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      traceId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
