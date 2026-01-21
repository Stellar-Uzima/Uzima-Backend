import Joi from 'joi';

const medicationSchema = Joi.object({
  name: Joi.string().required().trim().messages({
    'any.required': 'Medication name is required',
  }),
  dosage: Joi.string().required().trim().messages({
    'any.required': 'Dosage is required',
  }),
  frequency: Joi.string().required().trim().messages({
    'any.required': 'Frequency is required',
  }),
  duration: Joi.string().required().trim().messages({
    'any.required': 'Duration is required',
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'any.required': 'Quantity is required',
    'number.min': 'Quantity must be at least 1',
  }),
});

export const createPrescriptionSchema = {
  body: Joi.object({
    patientName: Joi.string().required().trim().messages({
      'any.required': 'Patient name is required',
    }),
    patientId: Joi.string().required().messages({
      'any.required': 'Patient ID is required',
    }),
    medications: Joi.array().items(medicationSchema).min(1).required().messages({
      'any.required': 'At least one medication is required',
      'array.min': 'At least one medication is required',
    }),
    instructions: Joi.string().optional().trim().allow(''),
    expiryDays: Joi.number().integer().min(1).max(365).optional().default(30).messages({
      'number.min': 'Expiry days must be at least 1',
      'number.max': 'Expiry days cannot exceed 365',
    }),
  }),
};

export const verifyPrescriptionSchema = {
  body: Joi.object({
    prescriptionNumber: Joi.string().required().trim().messages({
      'any.required': 'Prescription number is required',
    }),
    signature: Joi.string().required().messages({
      'any.required': 'Signature is required',
    }),
  }),
};

export const rejectPrescriptionSchema = {
  body: Joi.object({
    reason: Joi.string().optional().trim().allow(''),
  }),
};
