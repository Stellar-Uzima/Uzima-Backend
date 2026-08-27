import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Standardized error response schema used across all API error responses.
 * Every error returned by the API adheres to this structure.
 */
export interface ExceptionResponse {
  /** HTTP status code */
  statusCode: number;
  /** Machine-readable error identifier (e.g., "Bad Request", "Not Found") */
  error: string;
  /** Human-readable error message(s) */
  message: string | string[];
  /** ISO-8601 timestamp of when the error occurred */
  timestamp: string;
  /** The request path that triggered the error */
  path: string;
}

/**
 * Global HTTP exception filter that catches all exceptions and formats
 * them into a consistent, standardized error response schema.
 *
 * Handles:
 * - NestJS HttpExceptions (including validation errors with message arrays)
 * - Unknown/unexpected errors (wrapped as 500 Internal Server Error)
 * - Production-safe error logging (no stack traces in production)
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string | string[]) || message;
        error = (responseObj.error as string) || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const exceptionResponse: ExceptionResponse = {
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `500 Internal Server Error: ${Array.isArray(message) ? message.join(', ') : message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `HTTP ${statusCode}: ${Array.isArray(message) ? message.join(', ') : message}`,
      );
    }

    response.status(statusCode).json(exceptionResponse);
  }
}
