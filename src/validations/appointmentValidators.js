import Joi from 'joi';
import { customValidators } from '../middleware/validationMiddleware.js';

/**
 * Appointment validation schemas
 */

export const createAppointmentSchema = {
  body: Joi.object({
    patientId: customValidators.objectId.required(),
    doctorId: customValidators.objectId.required(),
    date: customValidators.date.required(),
    time: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .required()
      .messages({
        'string.pattern.base': 'Time must be in HH:MM format',
      }),
    duration: customValidators.positiveInt.optional().default(30).messages({
      'number.default': 'Duration defaults to 30 minutes',
    }),
    type: Joi.string()
      .valid('consultation', 'follow_up', 'emergency', 'routine_checkup')
      .required()
      .messages({
        'any.only':
          'Appointment type must be one of: consultation, follow_up, emergency, routine_checkup',
      }),
    reason: Joi.string().max(500).required().messages({
      'string.max': 'Reason must not exceed 500 characters',
      'any.required': 'Reason for appointment is required',
    }),
    notes: Joi.string().max(1000).optional(),
    location: Joi.object({
      type: Joi.string().valid('clinic', 'hospital', 'home', 'virtual').required().messages({
        'any.only': 'Location type must be one of: clinic, hospital, home, virtual',
      }),
      address: Joi.string()
        .max(200)
        .when('type', {
          is: Joi.string().valid('clinic', 'hospital', 'home'),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
      room: Joi.string().max(50).optional(),
      virtualLink: customValidators.url.when('type', {
        is: 'virtual',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
    }).required(),
    reminderSettings: Joi.object({
      email: Joi.boolean().optional().default(true),
      sms: Joi.boolean().optional().default(false),
      minutesBefore: Joi.number().integer().min(5).max(1440).optional().default(30).messages({
        'number.min': 'Reminder must be at least 5 minutes before appointment',
        'number.max': 'Reminder cannot be more than 24 hours before appointment',
      }),
    }).optional(),
    isUrgent: Joi.boolean().optional().default(false),
  }),
};

export const updateAppointmentSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    date: customValidators.date.optional(),
    time: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    duration: customValidators.positiveInt.optional(),
    type: Joi.string()
      .valid('consultation', 'follow_up', 'emergency', 'routine_checkup')
      .optional(),
    reason: Joi.string().max(500).optional(),
    notes: Joi.string().max(1000).optional(),
    status: Joi.string()
      .valid('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
      .optional()
      .messages({
        'any.only':
          'Status must be one of: scheduled, confirmed, in_progress, completed, cancelled, no_show',
      }),
    location: Joi.object({
      type: Joi.string().valid('clinic', 'hospital', 'home', 'virtual').optional(),
      address: Joi.string().max(200).optional(),
      room: Joi.string().max(50).optional(),
      virtualLink: customValidators.url.optional(),
    }).optional(),
    reminderSettings: Joi.object({
      email: Joi.boolean().optional(),
      sms: Joi.boolean().optional(),
      minutesBefore: Joi.number().integer().min(5).max(1440).optional(),
    }).optional(),
    isUrgent: Joi.boolean().optional(),
  }),
};

export const getAppointmentByIdSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
};

export const deleteAppointmentSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
};

export const getAppointmentsListSchema = {
  query: Joi.object({
    page: customValidators.nonNegativeInt.optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
    patientId: customValidators.objectId.optional(),
    doctorId: customValidators.objectId.optional(),
    dateFrom: customValidators.date.optional(),
    dateTo: customValidators.date.optional(),
    type: Joi.string()
      .valid('consultation', 'follow_up', 'emergency', 'routine_checkup')
      .optional(),
    status: Joi.string()
      .valid('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
      .optional(),
    isUrgent: Joi.boolean().optional(),
    sortBy: Joi.string().valid('date', 'time', 'createdAt').optional().default('date'),
    sortOrder: Joi.string().valid('asc', 'desc').optional().default('asc'),
  }),
};

export const cancelAppointmentSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    reason: Joi.string().max(500).required().messages({
      'any.required': 'Cancellation reason is required',
    }),
    notifyPatient: Joi.boolean().optional().default(true),
    notifyDoctor: Joi.boolean().optional().default(true),
  }),
};

export const rescheduleAppointmentSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    date: customValidators.date.required(),
    time: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .required(),
    reason: Joi.string().max(500).optional(),
    notifyPatient: Joi.boolean().optional().default(true),
    notifyDoctor: Joi.boolean().optional().default(true),
  }),
};

export const addAppointmentNotesSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    notes: Joi.string().max(1000).required().messages({
      'any.required': 'Notes are required',
    }),
    isConfidential: Joi.boolean().optional().default(false),
  }),
};

export const getAvailableSlotsSchema = {
  query: Joi.object({
    doctorId: customValidators.objectId.required(),
    date: customValidators.date.required(),
    duration: customValidators.positiveInt.optional().default(30),
  }),
};
