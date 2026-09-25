import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { API_ERROR_STATUS, ApiErrorCode } from '../errors/api-error-codes.enum';
import {
  ApiErrorBody,
  ApiErrorDetails,
  ApiErrorException,
  ApiErrorResponse,
} from '../errors/api-error.exception';
import { buildValidationDetails } from '../validation/validation-error.factory';

/**
 * Maps a Nest `HttpException` status onto the API's stable error-code set
 * (#1292). Anything unmapped falls back to the code for that status, so a new
 * exception type never leaks a raw `HttpStatus` number to clients.
 */
const STATUS_TO_CODE: Readonly<Record<number, ApiErrorCode>> = Object.freeze({
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.INSUFFICIENT_PERMISSION,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ApiErrorCode.BAD_REQUEST,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
  [HttpStatus.GONE]: ApiErrorCode.GONE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ApiErrorCode.SERVICE_UNAVAILABLE,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ApiErrorCode.INTERNAL_ERROR,
});

/**
 * The single global exception filter. Every failure leaving the API — thrown
 * exception, DTO rejection, malformed JSON, TypeORM constraint violation, or an
 * unexpected crash — is rendered as {@link ApiErrorResponse}.
 *
 * Client-caused failures (4xx) are logged at `warn` with the offending path;
 * server faults (5xx) are logged at `error` with the stack. The HTTP response
 * never contains a stack trace or a raw driver message: Postgres constraint
 * text and internal error strings are logged server-side and replaced with a
 * generic message, so a 500 cannot become an information disclosure.
 */
@Catch()
export class StandardizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StandardizedExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(isProduction: boolean = process.env.NODE_ENV === 'production') {
    this.isProduction = isProduction;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message, details } = this.resolve(exception, request);

    const body: ApiErrorBody = {
      code,
      message,
      statusCode,
      details,
      path: request.originalUrl ?? request.url,
      method: request.method,
      requestId: this.resolveRequestId(request),
      timestamp: new Date().toISOString(),
    };

    const payload: ApiErrorResponse = { error: body };
    this.log(statusCode, body, exception);

    if (response.headersSent) {
      this.logger.error('Response already sent; cannot write the error envelope');
      return;
    }

    response.status(statusCode).json(payload);
  }

  private resolve(
    exception: unknown,
    request: Request,
  ): { statusCode: number; code: ApiErrorCode | string; message: string; details?: ApiErrorDetails } {
    // 1. Errors that already carry a code and details.
    if (exception instanceof ApiErrorException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    // 2. Body-parser failures: malformed JSON, oversized payload, bad encoding.
    if (this.isBodyParserError(exception)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ApiErrorCode.MALFORMED_JSON,
        message: this.readBodyParserMessage(exception),
      };
    }

    // 3. Database constraint violations, so a unique-index race returns 409
    //    instead of a 500 with raw driver text.
    if (exception instanceof QueryFailedError) {
      return this.resolveDatabaseError(exception);
    }

    // 4. Standard Nest HTTP exceptions, including ValidationPipe.
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    // 5. Anything else is a bug on our side. Never echo the message out.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
    };
  }

  private resolveHttpException(exception: HttpException): {
    statusCode: number;
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetails;
  } {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return {
        statusCode,
        code: STATUS_TO_CODE[statusCode] ?? ApiErrorCode.INTERNAL_ERROR,
        message: payload,
      };
    }

    const object = payload as Record<string, unknown>;

    // ValidationPipe (the app's CustomValidationPipe flattens constraints into
    // an `errors` map of field -> messages).
    if (Array.isArray(object.message)) {
      const raw = object.message as unknown[];
      const asValidationErrors = raw.filter(
        (item): item is { property: string; children?: unknown[] } =>
          typeof item === 'object' && item !== null && 'property' in item,
      );

      const details =
        asValidationErrors.length > 0
          ? buildValidationDetails(asValidationErrors as never)
          : { errors: raw.map(String) };

      return {
        statusCode,
        code: ApiErrorCode.VALIDATION_FAILED,
        message:
          asValidationErrors.length > 0
            ? 'Request validation failed'
            : this.stringifyMessages(raw),
        details,
      };
    }

    if (this.isPlainDetails(object.errors)) {
      const fields = object.errors as ApiErrorDetails;
      return {
        statusCode,
        code: ApiErrorCode.VALIDATION_FAILED,
        message: typeof object.message === 'string' ? object.message : 'Request validation failed',
        details: {
          fields,
          errorCount: Object.values(fields).reduce(
            (total, value) => total + (Array.isArray(value) ? value.length : 1),
            0,
          ),
        },
      };
    }

    // A guard or interceptor that already set a code (e.g. RBAC denied).
    const explicitCode = typeof object.code === 'string' ? object.code : undefined;

    return {
      statusCode,
      code: explicitCode ?? STATUS_TO_CODE[statusCode] ?? ApiErrorCode.INTERNAL_ERROR,
      message:
        typeof object.message === 'string'
          ? object.message
          : (object.error as string) ?? exception.message,
      details: this.isPlainDetails(object.details) ? object.details : undefined,
    };
  }

  private resolveDatabaseError(exception: QueryFailedError): {
    statusCode: number;
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetails;
  } {
    const driverCode = (exception as QueryFailedError & { code?: string }).code;

    if (driverCode === '23505') {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ApiErrorCode.ALREADY_EXISTS,
        message: 'A record with these details already exists',
      };
    }

    if (driverCode === '23503') {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ApiErrorCode.CONFLICT,
        message: 'This operation references a record that does not exist',
      };
    }

    if (driverCode === '23514' || driverCode === '22P02') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'One or more values are not in the expected format',
      };
    }

    this.logger.error(
      `Unhandled database error (driver code ${driverCode ?? 'unknown'}): ${exception.message}`,
      exception.stack,
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
    };
  }

  private isBodyParserError(exception: unknown): boolean {
    if (typeof exception !== 'object' || exception === null) {
      return false;
    }
    const candidate = exception as { type?: string; status?: number; name?: string };
    return (
      candidate.type === 'entity.parse.failed' ||
      candidate.type === 'entity.too.large' ||
      candidate.name === 'PayloadTooLargeError'
    );
  }

  private readBodyParserMessage(exception: unknown): string {
    const candidate = exception as { type?: string };
    return candidate.type === 'entity.too.large'
      ? 'Request payload is too large'
      : 'Request body is not valid JSON';
  }

  private isPlainDetails(value: unknown): value is ApiErrorDetails {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stringifyMessages(messages: unknown[]): string {
    return messages.map(String).join(', ');
  }

  private resolveRequestId(request: Request): string | undefined {
    const header = request.headers['x-request-id'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    return Array.isArray(header) ? header[0] : undefined;
  }

  private log(statusCode: number, body: ApiErrorBody, exception: unknown): void {
    const location = `${body.method} ${body.path}`;
    const summary = `${body.code}: ${body.message}`;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${location} -> ${statusCode} ${summary}`, exception instanceof Error ? exception.stack : undefined);
      return;
    }

    this.logger.warn(`${location} -> ${statusCode} ${summary}`);
  }
}
