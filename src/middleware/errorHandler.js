import { v4 as uuidv4 } from 'uuid';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InternalServerError,
} from '../utils/errors.js';

/**
 * Map known error names/types to HTTP status codes
 */
const errorCodeMap = {
  ValidationError: 422,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  BadRequestError: 400,
  ConflictError: 409,
  CastError: 400, // Mongoose cast errors
  MongoError: 400, // MongoDB errors
  JsonWebTokenError: 401, // JWT errors
  TokenExpiredError: 401, // JWT expired
};

/**
 * Centralized Error Handler Middleware
 * Catches all sync/async errors and returns standardized error format
 * Format: { code, message, details?, correlationId }
 */
const errorHandler = (err, req, res, next) => {
  // Ensure correlation ID exists
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || uuidv4();

  // Set correlation ID in response header
  res.setHeader('x-correlation-id', correlationId);

  // Handle known error types
  let statusCode = 500;
  let code = 'errors.SERVER_ERROR';
  let message = 'Internal Server Error';
  let details = null;

  // If it's one of our custom AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details || undefined;
  }
  // Handle Mongoose validation errors
  else if (err.name === 'ValidationError' && err.errors) {
    statusCode = 422;
    code = 'errors.VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = err.errors[key].message;
      return acc;
    }, {});
  }
  // Handle Mongoose cast errors (invalid ObjectId, etc.)
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'errors.BAD_REQUEST';
    message = `Invalid ${err.path || 'parameter'}`;
    details = { path: err.path, value: err.value };
  }
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'errors.UNAUTHORIZED';
    message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
  }
  // Handle MongoDB duplicate key errors
  else if (err.name === 'MongoError' && err.code === 11000) {
    statusCode = 409;
    code = 'errors.CONFLICT';
    message = 'Resource already exists';
    const field = Object.keys(err.keyPattern || {})[0];
    details = field ? { field, value: err.keyValue?.[field] } : undefined;
  }
  // Map by error name
  else if (errorCodeMap[err.name]) {
    statusCode = errorCodeMap[err.name];
    code = err.code || `errors.${err.name.toUpperCase()}`;
    message = err.message || 'An error occurred';
    details = err.details || undefined;
  }
  // Handle errors with statusCode property
  else if (err.statusCode) {
    statusCode = err.statusCode;
    code = err.code || err.key || 'errors.UNKNOWN_ERROR';
    message = err.message || 'An error occurred';
    details = err.details || undefined;
  }
  // Default: Internal Server Error
  else {
    statusCode = 500;
    code = 'errors.INTERNAL_SERVER_ERROR';
    message =
      process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message || 'Internal Server Error';
    // Only include stack trace in development
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      details = { stack: err.stack };
    }
  }

  // Translate message if i18n is available
  if (req.t) {
    const translatedMessage = req.t(code, { defaultValue: message });
    message = translatedMessage !== code ? translatedMessage : message;
  }

  // Log error with full context
  const errorLog = {
    correlationId,
    code,
    message,
    statusCode,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body && Object.keys(req.body).length > 0 ? '[REDACTED]' : undefined,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
    },
  };

  // Use logger if available, otherwise console
  if (req.log && req.log.error) {
    req.log.error(errorLog);
  } else {
    // eslint-disable-next-line no-console
    console.error(`[${correlationId}] Error:`, {
      code,
      message,
      statusCode,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
  }

  // Send standardized error response
  const response = {
    code,
    message,
  };

  // Only include details if present
  if (details !== null && details !== undefined) {
    response.details = details;
  }

  // Include correlationId in response body
  response.correlationId = correlationId;

  res.status(statusCode).json(response);
};

export default errorHandler;
