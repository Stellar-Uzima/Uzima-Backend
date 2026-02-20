import Joi from 'joi';

/**
 * Schema for validating a single CSV row during record import.
 * Fields are intentionally loose on type (strings from CSV) and
 * coerced where appropriate.
 */
const csvRowSchema = Joi.object({
  patientName: Joi.string().trim().min(2).max(200).required().messages({
    'string.empty': 'Patient name is required',
    'string.min': 'Patient name must be at least 2 characters',
    'any.required': 'Patient name is required',
  }),
  diagnosis: Joi.string().trim().min(1).max(1000).required().messages({
    'string.empty': 'Diagnosis is required',
    'any.required': 'Diagnosis is required',
  }),
  treatment: Joi.string().trim().min(1).max(1000).required().messages({
    'string.empty': 'Treatment is required',
    'any.required': 'Treatment is required',
  }),
  date: Joi.date().iso().max('now').optional().messages({
    'date.format': 'Date must be a valid ISO date',
    'date.max': 'Date cannot be in the future',
  }),
  history: Joi.string().trim().max(5000).allow('', null).optional(),
});

/**
 * Validates a single parsed CSV row against the record import schema.
 * @param {Object} record - Raw row object from CSV parser
 * @returns {{ success: boolean, data?: Object, errors?: Array<{field: string, message: string}> }}
 */
function validateRow(record) {
  const { error, value } = csvRowSchema.validate(record, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return { success: false, errors };
  }

  return { success: true, data: value };
}

/**
 * Joi schema for validating the CSV upload request body/query params.
 */
const importUploadSchema = Joi.object({
  skipErrors: Joi.boolean().default(false),
});

export { validateRow, csvRowSchema, importUploadSchema };
