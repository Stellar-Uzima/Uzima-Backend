import Joi from 'joi';
import { sanitizeHtml } from '../utils/sanitizationUtils.js';
import ApiResponse from '../utils/apiResponse.js';

/**
 * Centralized validation middleware factory
 * @param {Object} schema - Joi schema object with body, params, query properties
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
export const validate = (schema, options = {}) => {
  const { stripHtml = true, allowUnknown = false } = options;

  return async (req, res, next) => {
    try {
      const errors = {};

      // Validate request body
      if (schema.body) {
        const bodyResult = schema.body.validate(req.body, {
          allowUnknown,
          abortEarly: false,
        });

        if (bodyResult.error) {
          errors.body = bodyResult.error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value,
          }));
        } else {
          // Sanitize body if validation passes
          if (stripHtml) {
            req.body = sanitizeObject(bodyResult.value);
          } else {
            req.body = bodyResult.value;
          }
        }
      }

      // Validate request parameters
      if (schema.params) {
        const paramsResult = schema.params.validate(req.params, {
          allowUnknown,
          abortEarly: false,
        });

        if (paramsResult.error) {
          errors.params = paramsResult.error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value,
          }));
        } else {
          req.params = paramsResult.value;
        }
      }

      // Validate query parameters
      if (schema.query) {
        const queryResult = schema.query.validate(req.query, {
          allowUnknown,
          abortEarly: false,
        });

        if (queryResult.error) {
          errors.query = queryResult.error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value,
          }));
        } else {
          req.query = queryResult.value;
        }
      }

      // If there are validation errors, return 422
      if (Object.keys(errors).length > 0) {
        return ApiResponse.validationError(res, 'Validation failed', errors);
      }

      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      return ApiResponse.error(res, 'Internal validation error', 500);
    }
  };
};

/**
 * Sanitize object recursively, stripping HTML and normalizing strings
 * @param {any} obj - Object to sanitize
 * @returns {any} Sanitized object
 */
const sanitizeObject = obj => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
};

/**
 * Sanitize string by stripping HTML and normalizing
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = str => {
  if (typeof str !== 'string') {
    return str;
  }

  // Strip HTML tags
  let sanitized = sanitizeHtml(str);

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Remove null bytes and control characters (except newlines and tabs)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
};

/**
 * Validate file uploads
 * @param {Object} options - Upload validation options
 * @returns {Function} Express middleware function
 */
export const validateFileUpload = (options = {}) => {
  const {
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxSize = 5 * 1024 * 1024, // 5MB default
    required = false,
  } = options;

  return (req, res, next) => {
    try {
      const file = req.file || req.files;

      if (!file && required) {
        return ApiResponse.validationError(res, 'File is required', {
          file: [{ field: 'file', message: 'File is required' }],
        });
      }

      if (file) {
        // Handle single file
        const files = Array.isArray(file) ? file : [file];

        for (const f of files) {
          // Check file type
          if (!allowedTypes.includes(f.mimetype)) {
            return ApiResponse.validationError(res, 'Invalid file type', {
              file: [
                {
                  field: 'file',
                  message: `File type ${f.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
                },
              ],
            });
          }

          // Check file size
          if (f.size > maxSize) {
            return ApiResponse.validationError(res, 'File too large', {
              file: [
                {
                  field: 'file',
                  message: `File size ${f.size} exceeds maximum allowed size ${maxSize} bytes`,
                },
              ],
            });
          }
        }
      }

      next();
    } catch (error) {
      console.error('File validation error:', error);
      return ApiResponse.error(res, 'File validation error', 500);
    }
  };
};

/**
 * Custom validation rules for common patterns
 */
export const customValidators = {
  // MongoDB ObjectId validation
  objectId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid ObjectId format',
    }),

  // Email validation
  email: Joi.string().email().lowercase().trim().messages({
    'string.email': 'Please provide a valid email address',
  }),

  // Password validation (minimum 8 chars, at least one letter and one number)
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one letter and one number',
    }),

  // Phone number validation
  phone: Joi.string()
    .pattern(/^\+?[\d\s\-()]+$/)
    .min(10)
    .max(15)
    .messages({
      'string.pattern.base': 'Please provide a valid phone number',
      'string.min': 'Phone number must be at least 10 digits',
      'string.max': 'Phone number must not exceed 15 digits',
    }),

  // URL validation
  url: Joi.string().uri().messages({
    'string.uri': 'Please provide a valid URL',
  }),

  // Date validation
  date: Joi.date().iso().messages({
    'date.format': 'Date must be in ISO 8601 format',
  }),

  // Positive integer validation
  positiveInt: Joi.number().integer().positive().messages({
    'number.base': 'Must be a number',
    'number.integer': 'Must be an integer',
    'number.positive': 'Must be a positive number',
  }),

  // Non-negative integer validation
  nonNegativeInt: Joi.number().integer().min(0).messages({
    'number.base': 'Must be a number',
    'number.integer': 'Must be an integer',
    'number.min': 'Must be a non-negative number',
  }),
};
