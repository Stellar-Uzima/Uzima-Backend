import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InternalServerError,
} from './errors.js';

/**
 * Standardized API Response Utility
 * All responses include correlation ID in headers and body
 */
class ApiResponse {
  /**
   * Success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} messageKey - i18n message key
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data, messageKey = 'success.OPERATION_SUCCESS', statusCode = 200) {
    const message = res.req.t ? res.req.t(messageKey, { defaultValue: messageKey }) : messageKey;
    const correlationId = res.req.correlationId || res.getHeader('x-correlation-id');
    
    // Ensure correlation ID is in header
    if (correlationId) {
      res.setHeader('x-correlation-id', correlationId);
    }

    const response = {
      success: true,
      message,
      data,
    };

    // Include correlationId in response body
    if (correlationId) {
      response.correlationId = correlationId;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Error response - throws error to be caught by error handler
   * This ensures all errors go through centralized error handling
   * @param {Object} res - Express response object (unused, kept for backward compatibility)
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 400)
   * @param {string} code - Error code (optional)
   * @param {*} details - Error details (optional)
   * @throws {AppError} Always throws an error to be caught by error handler
   */
  static error(res, message = 'An error occurred', statusCode = 400, code = null, details = null) {
    let ErrorClass;
    switch (statusCode) {
      case 400:
        ErrorClass = BadRequestError;
        break;
      case 401:
        ErrorClass = UnauthorizedError;
        break;
      case 403:
        ErrorClass = ForbiddenError;
        break;
      case 404:
        ErrorClass = NotFoundError;
        break;
      case 422:
        ErrorClass = ValidationError;
        break;
      case 500:
        ErrorClass = InternalServerError;
        break;
      default:
        ErrorClass = BadRequestError;
    }

    const error = new ErrorClass(message, details);
    if (code) {
      error.code = code;
    }
    
    // Throw error to be caught by error handler middleware
    throw error;
  }

  /**
   * Validation error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {Object} errors - Validation errors object
   */
  static validationError(res, message = 'Validation failed', errors = {}) {
    throw new ValidationError(message, errors);
  }
}

export default ApiResponse;
