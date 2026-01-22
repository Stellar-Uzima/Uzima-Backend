import Joi from 'joi';

/**
 * Validation schema for sending email notification
 */
export const sendEmailSchema = Joi.object({
  to: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email address',
      'any.required': 'Recipient email is required',
    }),
  
  subject: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.min': 'Subject cannot be empty',
      'string.max': 'Subject cannot exceed 200 characters',
      'any.required': 'Email subject is required',
    }),
  
  html: Joi.string()
    .min(1)
    .required()
    .messages({
      'string.min': 'HTML content cannot be empty',
      'any.required': 'HTML content is required',
    }),
  
  text: Joi.string()
    .optional()
    .allow('', null),
  
  type: Joi.string()
    .valid('account_activation', 'password_reset', 'health_record_update', 'appointment_reminder', 'general')
    .default('general')
    .messages({
      'any.only': 'Invalid notification type',
    }),
  
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
    }),
});

/**
 * Validation schema for listing notifications
 */
export const listNotificationsSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'queued', 'sent', 'failed', 'retrying')
    .optional(),
  
  type: Joi.string()
    .valid('account_activation', 'password_reset', 'health_record_update', 'appointment_reminder', 'general')
    .optional(),
  
  email: Joi.string()
    .email()
    .optional(),
  
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50)
    .optional(),
  
  skip: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .optional(),
});

/**
 * Validation schema for notification ID parameter
 */
export const notificationIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid notification ID format',
      'any.required': 'Notification ID is required',
    }),
});

export default {
  sendEmailSchema,
  listNotificationsSchema,
  notificationIdSchema,
};
