import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ExceptionResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status code
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Get error message
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
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
      error = 'Internal Server Error';
    }

    // Create structured response
    const exceptionResponse: ExceptionResponse = {
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Log the error (don't log stack trace in production)
    if (statusCode >= 500) {
      this.logger.error(
        `500 Internal Server Error: ${Array.isArray(message) ? message.join(', ') : message}`,
        exception instanceof Error
          ? exception.stack
          : 'No stack trace available',
      );
    } else {
      this.logger.warn(
        `HTTP ${statusCode}: ${Array.isArray(message) ? message.join(', ') : message}`,
      );
    }

    // Send response
    response.status(statusCode).json(exceptionResponse);
  }
}
