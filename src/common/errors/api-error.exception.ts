import { HttpException } from '@nestjs/common';
import { API_ERROR_STATUS, ApiErrorCode } from './api-error-codes.enum';

/** Per-field validation messages, keyed by the offending property name. */
export type ApiErrorDetails = Record<string, string[] | string | number | boolean | undefined>;

/**
 * The single error envelope every API response uses (#1292).
 *
 * ```json
 * {
 *   "error": {
 *     "code": "INVALID_SEARCH_FILTER",
 *     "message": "sortBy must be one of: email, createdAt, lastActiveAt",
 *     "statusCode": 400,
 *     "details": { "sortBy": ["..."] },
 *     "path": "/admin/users/directory",
 *     "method": "GET",
 *     "requestId": "0f4c…",
 *     "timestamp": "2026-01-01T12:00:00.000Z"
 *   }
 * }
 * ```
 */
export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  statusCode: number;
  details?: ApiErrorDetails;
  path: string;
  method: string;
  requestId?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

/**
 * An `HttpException` that carries a stable {@link ApiErrorCode} and structured
 * `details`, so the global filter can render it without guessing.
 */
export class ApiErrorException extends HttpException {
  readonly code: ApiErrorCode | string;
  readonly details?: ApiErrorDetails;

  constructor(
    code: ApiErrorCode | string,
    message: string,
    options: { status?: number; details?: ApiErrorDetails } = {},
  ) {
    const status = options.status ?? API_ERROR_STATUS[code as ApiErrorCode] ?? 500;
    super({ code, message, statusCode: status, details: options.details }, status);
    this.code = code;
    this.details = options.details;
    this.name = 'ApiErrorException';
  }
}

/** 400 with a structured, per-field message. */
export class BadRequestApiException extends ApiErrorException {
  constructor(message: string, details?: ApiErrorDetails) {
    super(ApiErrorCode.BAD_REQUEST, message, { status: 400, details });
    this.name = 'BadRequestApiException';
  }
}

/** 401 — the caller is not authenticated. */
export class UnauthenticatedApiException extends ApiErrorException {
  constructor(message = 'Authentication is required') {
    super(ApiErrorCode.UNAUTHENTICATED, message, { status: 401 });
    this.name = 'UnauthenticatedApiException';
  }
}

/** 403 — authenticated, but not allowed. */
export class ForbiddenApiException extends ApiErrorException {
  constructor(message = 'You do not have permission to perform this action', code: ApiErrorCode = ApiErrorCode.INSUFFICIENT_PERMISSION) {
    super(code, message, { status: 403 });
    this.name = 'ForbiddenApiException';
  }
}

/** 404 for a specific resource, e.g. `USER_NOT_FOUND`. */
export class NotFoundApiException extends ApiErrorException {
  constructor(resource: string, identifier?: string | number, code: ApiErrorCode = ApiErrorCode.NOT_FOUND) {
    super(
      code,
      identifier === undefined
        ? `${resource} was not found`
        : `${resource} '${identifier}' was not found`,
      { status: 404 },
    );
    this.name = 'NotFoundApiException';
  }
}

/** 409 for a state or uniqueness conflict. */
export class ConflictApiException extends ApiErrorException {
  constructor(message: string, code: ApiErrorCode = ApiErrorCode.CONFLICT, details?: ApiErrorDetails) {
    super(code, message, { status: 409, details });
    this.name = 'ConflictApiException';
  }
}

/** 422 for syntactically valid but semantically rejected input. */
export class UnprocessableApiException extends ApiErrorException {
  constructor(message: string, details?: ApiErrorDetails) {
    super(ApiErrorCode.VALIDATION_FAILED, message, { status: 422, details });
    this.name = 'UnprocessableApiException';
  }
}

/** 429 for throttled callers. */
export class RateLimitedApiException extends ApiErrorException {
  constructor(message = 'Too many requests', details?: ApiErrorDetails) {
    super(ApiErrorCode.RATE_LIMITED, message, { status: 429, details });
    this.name = 'RateLimitedApiException';
  }
}
