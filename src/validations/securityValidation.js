import Joi from 'joi';

/**
 * Security validation schemas
 */

// Device trust update schema
export const trustDeviceSchema = Joi.object({
  trusted: Joi.boolean().required().messages({
    'boolean.base': 'Trusted must be a boolean value',
    'any.required': 'Trusted status is required',
  }),
});

// Device query parameters schema
export const deviceQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10).messages({
    'number.base': 'Limit must be a number',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 50',
  }),
  offset: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'Offset must be a number',
    'number.min': 'Offset must be at least 0',
  }),
  activeOnly: Joi.string().valid('true', 'false').default('true').messages({
    'any.only': 'activeOnly must be "true" or "false"',
  }),
  sortBy: Joi.string()
    .valid('lastSeenAt', '-lastSeenAt', 'firstSeenAt', '-firstSeenAt', 'loginCount', '-loginCount')
    .default('-lastSeenAt')
    .messages({
      'any.only': 'Invalid sort field',
    }),
});

// Activity query parameters schema
export const activityQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).default(50).messages({
    'number.base': 'Limit must be a number',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 200',
  }),
  offset: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'Offset must be a number',
    'number.min': 'Offset must be at least 0',
  }),
  startDate: Joi.date().iso().optional().messages({
    'date.format': 'startDate must be a valid ISO date',
  }),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).optional().messages({
    'date.format': 'endDate must be a valid ISO date',
    'date.greater': 'endDate must be after startDate',
  }),
  flaggedOnly: Joi.string().valid('true', 'false').default('false').messages({
    'any.only': 'flaggedOnly must be "true" or "false"',
  }),
  sortBy: Joi.string()
    .valid('loginAt', '-loginAt', 'ipAddress', '-ipAddress')
    .default('-loginAt')
    .messages({
      'any.only': 'Invalid sort field',
    }),
});

// Security summary query schema
export const securitySummaryQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30).messages({
    'number.base': 'Days must be a number',
    'number.min': 'Days must be at least 1',
    'number.max': 'Days cannot exceed 365',
  }),
});

// Fraud report query schema
export const fraudReportQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(90).default(30).messages({
    'number.base': 'Days must be a number',
    'number.min': 'Days must be at least 1',
    'number.max': 'Days cannot exceed 90',
  }),
});

// Device ID parameter schema
export const deviceIdParamSchema = Joi.object({
  deviceId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid device ID format',
      'string.empty': 'Device ID is required',
    }),
});

export default {
  trustDeviceSchema,
  deviceQuerySchema,
  activityQuerySchema,
  securitySummaryQuerySchema,
  fraudReportQuerySchema,
  deviceIdParamSchema,
};
