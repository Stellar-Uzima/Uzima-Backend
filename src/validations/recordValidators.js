import Joi from 'joi';
import { customValidators } from '../middleware/validationMiddleware.js';

/**
 * Medical record validation schemas
 */

export const createRecordSchema = {
  body: Joi.object({
    patientId: customValidators.objectId.required(),
    type: Joi.string()
      .valid('consultation', 'lab_result', 'prescription', 'vaccination', 'procedure')
      .required()
      .messages({
        'any.only':
          'Record type must be one of: consultation, lab_result, prescription, vaccination, procedure',
      }),
    title: Joi.string().min(5).max(200).required().messages({
      'string.min': 'Title must be at least 5 characters',
      'string.max': 'Title must not exceed 200 characters',
      'any.required': 'Title is required',
    }),
    description: Joi.string().max(2000).optional(),
    date: customValidators.date.required(),
    doctorId: customValidators.objectId.optional(),
    hospital: Joi.string().max(100).optional(),
    department: Joi.string().max(50).optional(),
    diagnosis: Joi.array()
      .items(
        Joi.object({
          code: Joi.string().max(20).optional(),
          description: Joi.string().max(200).required(),
          severity: Joi.string().valid('mild', 'moderate', 'severe').optional(),
        })
      )
      .optional(),
    medications: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().max(100).required(),
          dosage: Joi.string().max(50).required(),
          frequency: Joi.string().max(50).required(),
          duration: Joi.string().max(50).optional(),
          instructions: Joi.string().max(500).optional(),
        })
      )
      .optional(),
    labResults: Joi.array()
      .items(
        Joi.object({
          testName: Joi.string().max(100).required(),
          value: Joi.string().max(50).required(),
          unit: Joi.string().max(20).optional(),
          normalRange: Joi.string().max(50).optional(),
          status: Joi.string().valid('normal', 'abnormal', 'critical').optional(),
        })
      )
      .optional(),
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().max(255).required(),
          fileType: Joi.string().max(50).required(),
          fileSize: Joi.number().positive().optional(),
        })
      )
      .optional(),
    tags: Joi.array().items(Joi.string().max(30)).max(10).optional().messages({
      'array.max': 'Maximum 10 tags allowed',
    }),
    isConfidential: Joi.boolean().optional().default(false),
  }),
};

export const updateRecordSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    title: Joi.string().min(5).max(200).optional(),
    description: Joi.string().max(2000).optional(),
    date: customValidators.date.optional(),
    doctorId: customValidators.objectId.optional(),
    hospital: Joi.string().max(100).optional(),
    department: Joi.string().max(50).optional(),
    diagnosis: Joi.array()
      .items(
        Joi.object({
          code: Joi.string().max(20).optional(),
          description: Joi.string().max(200).required(),
          severity: Joi.string().valid('mild', 'moderate', 'severe').optional(),
        })
      )
      .optional(),
    medications: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().max(100).required(),
          dosage: Joi.string().max(50).required(),
          frequency: Joi.string().max(50).required(),
          duration: Joi.string().max(50).optional(),
          instructions: Joi.string().max(500).optional(),
        })
      )
      .optional(),
    labResults: Joi.array()
      .items(
        Joi.object({
          testName: Joi.string().max(100).required(),
          value: Joi.string().max(50).required(),
          unit: Joi.string().max(20).optional(),
          normalRange: Joi.string().max(50).optional(),
          status: Joi.string().valid('normal', 'abnormal', 'critical').optional(),
        })
      )
      .optional(),
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().max(255).required(),
          fileType: Joi.string().max(50).required(),
          fileSize: Joi.number().positive().optional(),
        })
      )
      .optional(),
    tags: Joi.array().items(Joi.string().max(30)).max(10).optional(),
    isConfidential: Joi.boolean().optional(),
  }),
};

export const getRecordByIdSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
};

export const deleteRecordSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
};

export const getRecordsListSchema = {
  query: Joi.object({
    page: customValidators.nonNegativeInt.optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
    patientId: customValidators.objectId.optional(),
    type: Joi.string()
      .valid('consultation', 'lab_result', 'prescription', 'vaccination', 'procedure')
      .optional(),
    doctorId: customValidators.objectId.optional(),
    dateFrom: customValidators.date.optional(),
    dateTo: customValidators.date.optional(),
    search: Joi.string().max(100).optional(),
    tags: Joi.string().optional(), // Comma-separated tags
    isConfidential: Joi.boolean().optional(),
    sortBy: Joi.string().valid('date', 'title', 'createdAt').optional().default('date'),
    sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
  }),
};

export const shareRecordSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  body: Joi.object({
    recipientId: customValidators.objectId.required(),
    permissions: Joi.array()
      .items(Joi.string().valid('read', 'download', 'print'))
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one permission must be specified',
      }),
    expiresAt: customValidators.date.optional(),
    message: Joi.string().max(500).optional(),
  }),
};

export const addAttachmentSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
  }),
  // File validation will be handled by validateFileUpload middleware
};

export const removeAttachmentSchema = {
  params: Joi.object({
    id: customValidators.objectId.required(),
    attachmentId: customValidators.objectId.required(),
  }),
};
