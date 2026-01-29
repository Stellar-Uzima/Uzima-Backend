/* eslint-disable prettier/prettier */
import Joi from 'joi';

// Valid roles and actions
const validRoles = ['admin', 'doctor', 'educator', 'patient'];
const validActions = ['read', 'create', 'update', 'delete', 'manage'];

/**
 * Validation schema for creating a permission
 */
export const createPermissionSchema = Joi.object({
  body: Joi.object({
    resource: Joi.string()
      .required()
      .min(2)
      .max(50)
      .trim()
      .lowercase()
      .pattern(/^[a-z0-9-_]+$/)
      .messages({
        'string.base': 'Resource must be a string',
        'string.empty': 'Resource is required',
        'string.min': 'Resource must be at least 2 characters',
        'string.max': 'Resource must not exceed 50 characters',
        'string.pattern.base': 'Resource must contain only lowercase letters, numbers, hyphens, and underscores',
        'any.required': 'Resource is required',
      }),
    action: Joi.string()
      .required()
      .valid(...validActions)
      .messages({
        'string.base': 'Action must be a string',
        'string.empty': 'Action is required',
        'any.only': `Action must be one of: ${validActions.join(', ')}`,
        'any.required': 'Action is required',
      }),
    roles: Joi.array()
      .items(Joi.string().valid(...validRoles))
      .min(1)
      .required()
      .messages({
        'array.base': 'Roles must be an array',
        'array.min': 'At least one role must be specified',
        'any.only': `Each role must be one of: ${validRoles.join(', ')}`,
        'any.required': 'Roles are required',
      }),
    description: Joi.string()
      .max(200)
      .trim()
      .allow('')
      .optional()
      .messages({
        'string.base': 'Description must be a string',
        'string.max': 'Description must not exceed 200 characters',
      }),
  }),
});

/**
 * Validation schema for updating a permission
 */
export const updatePermissionSchema = Joi.object({
  params: Joi.object({
    id: Joi.string()
      .required()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({
        'string.pattern.base': 'Invalid permission ID format',
        'any.required': 'Permission ID is required',
      }),
  }),
  body: Joi.object({
    resource: Joi.string()
      .min(2)
      .max(50)
      .trim()
      .lowercase()
      .pattern(/^[a-z0-9-_]+$/)
      .optional()
      .messages({
        'string.base': 'Resource must be a string',
        'string.min': 'Resource must be at least 2 characters',
        'string.max': 'Resource must not exceed 50 characters',
        'string.pattern.base': 'Resource must contain only lowercase letters, numbers, hyphens, and underscores',
      }),
    action: Joi.string()
      .valid(...validActions)
      .optional()
      .messages({
        'string.base': 'Action must be a string',
        'any.only': `Action must be one of: ${validActions.join(', ')}`,
      }),
    roles: Joi.array()
      .items(Joi.string().valid(...validRoles))
      .min(1)
      .optional()
      .messages({
        'array.base': 'Roles must be an array',
        'array.min': 'At least one role must be specified',
        'any.only': `Each role must be one of: ${validRoles.join(', ')}`,
      }),
    description: Joi.string()
      .max(200)
      .trim()
      .allow('')
      .optional()
      .messages({
        'string.base': 'Description must be a string',
        'string.max': 'Description must not exceed 200 characters',
      }),
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update',
  }),
});

/**
 * Validation schema for getting permission by ID
 */
export const getPermissionByIdSchema = Joi.object({
  params: Joi.object({
    id: Joi.string()
      .required()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({
        'string.pattern.base': 'Invalid permission ID format',
        'any.required': 'Permission ID is required',
      }),
  }),
});

/**
 * Validation schema for deleting a permission
 */
export const deletePermissionSchema = Joi.object({
  params: Joi.object({
    id: Joi.string()
      .required()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({
        'string.pattern.base': 'Invalid permission ID format',
        'any.required': 'Permission ID is required',
      }),
  }),
});

/**
 * Validation schema for getting role permissions
 */
export const getRolePermissionsSchema = Joi.object({
  params: Joi.object({
    role: Joi.string()
      .required()
      .valid(...validRoles)
      .messages({
        'string.base': 'Role must be a string',
        'any.only': `Role must be one of: ${validRoles.join(', ')}`,
        'any.required': 'Role is required',
      }),
  }),
});

/**
 * Validation schema for listing permissions with filters
 */
export const getPermissionsListSchema = Joi.object({
  query: Joi.object({
    resource: Joi.string()
      .min(2)
      .max(50)
      .trim()
      .lowercase()
      .optional()
      .messages({
        'string.base': 'Resource must be a string',
        'string.min': 'Resource must be at least 2 characters',
        'string.max': 'Resource must not exceed 50 characters',
      }),
    action: Joi.string()
      .valid(...validActions)
      .optional()
      .messages({
        'string.base': 'Action must be a string',
        'any.only': `Action must be one of: ${validActions.join(', ')}`,
      }),
    role: Joi.string()
      .valid(...validRoles)
      .optional()
      .messages({
        'string.base': 'Role must be a string',
        'any.only': `Role must be one of: ${validRoles.join(', ')}`,
      }),
  }),
});
