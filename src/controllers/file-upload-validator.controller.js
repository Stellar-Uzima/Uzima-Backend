import Joi from 'joi';
import { validateAndSanitizeFilename } from '../utils/filename-sanitizer.js';
import ApiResponse from '../utils/apiResponse.js';

/**
 * Validation constants
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MIME_TYPE_EXTENSIONS = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

/**
 * Joi schema for pre-upload validation
 */
const preUploadSchema = Joi.object({
  filename: Joi.string().required().min(1).max(255).messages({
    'string.base': 'Filename must be a string',
    'string.empty': 'Filename is required',
    'string.min': 'Filename cannot be empty',
    'string.max': 'Filename is too long (max 255 characters)',
    'any.required': 'Filename is required',
  }),
  contentType: Joi.string()
    .valid(...ALLOWED_MIME_TYPES)
    .required()
    .messages({
      'string.base': 'Content type must be a string',
      'any.only': 'File type not allowed. Allowed types: PDF, JPG, PNG, DOCX',
      'any.required': 'Content type is required',
    }),
  size: Joi.number().integer().min(1).max(MAX_FILE_SIZE).required().messages({
    'number.base': 'File size must be a number',
    'number.integer': 'File size must be an integer',
    'number.min': 'File cannot be empty',
    'number.max': `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    'any.required': 'File size is required',
  }),
});

/**
 * Controller for pre-upload validation endpoint
 */
const fileUploadValidatorController = {
  /**
   * Validate file metadata before actual upload
   * POST /api/uploads/validate
   */
  validatePreUpload: async (req, res) => {
    try {
      // Validate request body with Joi
      const { error, value } = preUploadSchema.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));

        return ApiResponse.validationError(
          res,
          'Validation failed',
          { body: validationErrors }
        );
      }

      const { filename, contentType, size } = value;

      // Validate filename
      const filenameValidation = validateAndSanitizeFilename(filename);
      if (!filenameValidation.valid) {
        return ApiResponse.validationError(
          res,
          'Invalid filename',
          {
            filename: [
              {
                field: 'filename',
                message: filenameValidation.error,
                issues: filenameValidation.issues || [],
              },
            ],
          }
        );
      }

      // Check if extension matches content type
      const extension = filenameValidation.extension;
      const allowedExtensions = MIME_TYPE_EXTENSIONS[contentType];

      if (!allowedExtensions || !allowedExtensions.includes(extension)) {
        return ApiResponse.validationError(
          res,
          'File extension does not match content type',
          {
            filename: [
              {
                field: 'filename',
                message: `Extension ${extension} does not match content type ${contentType}`,
                expectedExtensions: allowedExtensions,
              },
            ],
          }
        );
      }

      // All validations passed
      return ApiResponse.success(
        res,
        {
          valid: true,
          sanitizedFilename: filenameValidation.sanitized,
          extension,
          contentType,
          size,
          sizeInMB: (size / (1024 * 1024)).toFixed(2),
          guidelines: {
            maxSize: `${MAX_FILE_SIZE / (1024 * 1024)}MB`,
            allowedTypes: 'PDF, JPG, PNG, DOCX',
            securityNote: 'File will be scanned for viruses after upload',
          },
        },
        'File validation passed'
      );
    } catch (error) {
      console.error('Pre-upload validation error:', error);
      return ApiResponse.error(
        res,
        'An error occurred during validation',
        500
      );
    }
  },

  /**
   * Get upload guidelines
   * GET /api/uploads/guidelines
   */
  getUploadGuidelines: async (req, res) => {
    try {
      return ApiResponse.success(res, {
        maxFileSize: MAX_FILE_SIZE,
        maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
        allowedMimeTypes: ALLOWED_MIME_TYPES,
        allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.docx'],
        allowedTypesDescription: 'PDF, JPG, PNG, DOCX',
        securityFeatures: [
          'File signature verification (magic number check)',
          'MIME type validation',
          'Filename sanitization',
          'Virus scanning',
          'Malicious file detection',
        ],
        bestPractices: [
          'Use descriptive filenames',
          'Avoid special characters in filenames',
          'Ensure file extension matches content',
          'Keep files under 10MB',
          'Only upload necessary files',
        ],
      });
    } catch (error) {
      console.error('Error getting upload guidelines:', error);
      return ApiResponse.error(res, 'Failed to get upload guidelines', 500);
    }
  },
};

export default fileUploadValidatorController;
