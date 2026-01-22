import Joi from 'joi';
import { customValidators } from '../middleware/validationMiddleware.js';

/**
 * User management validation schemas
 */

export const updateProfileSchema = {
  body: Joi.object({
    firstName: Joi.string().min(2).max(50).optional().messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name must not exceed 50 characters',
    }),
    lastName: Joi.string().min(2).max(50).optional().messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name must not exceed 50 characters',
    }),
    phone: customValidators.phone.optional(),
    dateOfBirth: customValidators.date.optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional().messages({
      'any.only': 'Gender must be one of: male, female, other',
    }),
    address: Joi.object({
      street: Joi.string().max(100).optional(),
      city: Joi.string().max(50).optional(),
      state: Joi.string().max(50).optional(),
      zipCode: Joi.string().max(10).optional(),
      country: Joi.string().max(50).optional(),
    }).optional(),
    emergencyContact: Joi.object({
      name: Joi.string().max(100).optional(),
      relationship: Joi.string().max(50).optional(),
      phone: customValidators.phone.optional(),
      email: customValidators.email.optional(),
    }).optional(),
    preferences: Joi.object({
      language: Joi.string().valid('en', 'fr', 'sw').optional().messages({
        'any.only': 'Language must be one of: en, fr, sw',
      }),
      timezone: Joi.string().max(50).optional(),
      notifications: Joi.object({
        email: Joi.boolean().optional(),
        sms: Joi.boolean().optional(),
        push: Joi.boolean().optional(),
      }).optional(),
    }).optional(),
  }),
};

export const getUserByIdSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
};

export const updateUserSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    firstName: Joi.string().min(2).max(50).optional(),
    lastName: Joi.string().min(2).max(50).optional(),
    email: customValidators.email.optional(),
    phone: customValidators.phone.optional(),
    role: Joi.string().valid('patient', 'doctor', 'admin').optional(),
    isActive: Joi.boolean().optional(),
    isEmailVerified: Joi.boolean().optional(),
    dateOfBirth: customValidators.date.optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    address: Joi.object({
      street: Joi.string().max(100).optional(),
      city: Joi.string().max(50).optional(),
      state: Joi.string().max(50).optional(),
      zipCode: Joi.string().max(10).optional(),
      country: Joi.string().max(50).optional(),
    }).optional(),
  }),
};

export const deleteUserSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
};

export const getUserListSchema = {
  query: Joi.object({
    page: customValidators.nonNegativeInt.optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10).messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 100',
    }),
    search: Joi.string().max(100).optional(),
    role: Joi.string().valid('patient', 'doctor', 'admin').optional(),
    isActive: Joi.boolean().optional(),
    sortBy: Joi.string()
      .valid('firstName', 'lastName', 'email', 'createdAt')
      .optional()
      .default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
  }),
};

export const uploadAvatarSchema = {
  // File validation will be handled by validateFileUpload middleware
};

export const updatePreferencesSchema = {
  body: Joi.object({
    language: Joi.string().valid('en', 'fr', 'sw').optional(),
    timezone: Joi.string().max(50).optional(),
    notifications: Joi.object({
      email: Joi.boolean().optional(),
      sms: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
    }).optional(),
    privacy: Joi.object({
      profileVisibility: Joi.string().valid('public', 'private', 'friends').optional(),
      dataSharing: Joi.boolean().optional(),
    }).optional(),
  }),
};
