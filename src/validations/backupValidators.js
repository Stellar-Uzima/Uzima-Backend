import Joi from 'joi';

/**
 * Backup validation schemas
 */

export const createFilteredBackupSchema = {
  body: Joi.object({
    collections: Joi.array().items(Joi.string().min(1).max(100)).min(1).required().messages({
      'array.min': 'At least one collection must be specified',
      'array.required': 'Collections array is required',
    }),
    filters: Joi.object({
      startDate: Joi.date().iso().optional().messages({
        'date.format': 'Start date must be a valid ISO 8601 date',
      }),
      endDate: Joi.date().iso().optional().min(Joi.ref('startDate')).messages({
        'date.format': 'End date must be a valid ISO 8601 date',
        'date.min': 'End date must be after start date',
      }),
      recordTypes: Joi.array().items(Joi.string()).optional().messages({
        'array.base': 'Record types must be an array',
      }),
      userId: Joi.string().hex().length(24).optional().messages({
        'string.length': 'User ID must be a valid MongoDB ObjectId',
      }),
      status: Joi.array().items(Joi.string()).optional().messages({
        'array.base': 'Status must be an array',
      }),
    })
      .optional()
      .messages({
        'object.base': 'Filters must be an object',
      }),
    format: Joi.string().valid('json', 'csv', 'both').default('both').optional().messages({
      'any.only': 'Format must be one of: json, csv, both',
    }),
  })
    .required()
    .messages({
      'object.required': 'Request body is required',
    }),
};

export const downloadFilteredBackupSchema = {
  params: Joi.object({
    backupId: Joi.string()
      .pattern(/^filtered-backup-/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid backup ID format',
        'any.required': 'Backup ID is required',
      }),
  }),
  query: Joi.object({
    format: Joi.string().valid('json', 'csv').default('json').optional().messages({
      'any.only': 'Format must be json or csv',
    }),
  }),
};

export const backupIdSchema = {
  params: Joi.object({
    backupId: Joi.string().required().messages({
      'any.required': 'Backup ID is required',
    }),
  }),
};

export const listFilteredBackupsSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1).optional().messages({
      'number.base': 'Page must be a number',
      'number.min': 'Page must be at least 1',
    }),
    limit: Joi.number().integer().min(1).max(100).default(20).optional().messages({
      'number.base': 'Limit must be a number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100',
    }),
  }),
};
