import Joi from 'joi';
import { customValidators } from '../middleware/validationMiddleware.js';

/**
 * Authentication validation schemas
 */

export const registerSchema = {
  body: Joi.object({
    firstName: Joi.string().min(2).max(50).required().messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name must not exceed 50 characters',
      'any.required': 'First name is required',
    }),
    lastName: Joi.string().min(2).max(50).required().messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name must not exceed 50 characters',
      'any.required': 'Last name is required',
    }),
    email: customValidators.email.required(),
    password: customValidators.password.required(),
    phone: customValidators.phone.optional(),
    role: Joi.string().valid('patient', 'doctor', 'admin').optional().messages({
      'any.only': 'Role must be one of: patient, doctor, admin',
    }),
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
  }),
};

export const loginSchema = {
  body: Joi.object({
    email: customValidators.email.required(),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
    rememberMe: Joi.boolean().optional(),
  }),
};

export const forgotPasswordSchema = {
  body: Joi.object({
    email: customValidators.email.required(),
  }),
};

export const resetPasswordSchema = {
  body: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Reset token is required',
    }),
    password: customValidators.password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Confirm password must match password',
    }),
  }),
};

export const changePasswordSchema = {
  body: Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Current password is required',
    }),
    newPassword: customValidators.password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'Confirm password must match new password',
    }),
  }),
};

export const verifyEmailSchema = {
  params: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Verification token is required',
    }),
  }),
};

export const resendVerificationSchema = {
  body: Joi.object({
    email: customValidators.email.required(),
  }),
};

export const twoFactorSetupSchema = {
  body: Joi.object({
    method: Joi.string().valid('sms', 'email', 'app').required().messages({
      'any.only': 'Two-factor method must be one of: sms, email, app',
    }),
    phone: customValidators.phone.when('method', {
      is: 'sms',
      then: customValidators.phone.required(),
      otherwise: customValidators.phone.optional(),
    }),
  }),
};

export const twoFactorVerifySchema = {
  body: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.length': 'Two-factor code must be 6 digits',
      'string.pattern.base': 'Two-factor code must contain only numbers',
      'any.required': 'Two-factor code is required',
    }),
    backupCode: Joi.string().optional(),
  }),
};
