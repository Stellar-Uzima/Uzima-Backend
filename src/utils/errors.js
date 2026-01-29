/**
 * Custom Error Classes for Centralized Error Handling
 * These errors will be automatically mapped to appropriate HTTP status codes
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code || this.getDefaultCode();
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  getDefaultCode() {
    return `errors.${this.constructor.name.toUpperCase()}`;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, 'errors.BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, 'errors.UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details = null) {
    super(message, 403, 'errors.FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'errors.NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 422, 'errors.VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'errors.CONFLICT', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', details = null) {
    super(message, 500, 'errors.INTERNAL_SERVER_ERROR', details);
  }
}

/**
 * Async error wrapper to catch async errors in route handlers
 * Usage: wrapAsync(async (req, res, next) => { ... })
 */
export const wrapAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
