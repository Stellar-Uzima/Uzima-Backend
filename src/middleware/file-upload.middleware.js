import multer from 'multer';
import { validateAndSanitizeFilename } from '../utils/filename-sanitizer.js';
import ApiResponse from '../utils/apiResponse.js';

/**
 * File upload configuration constants
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Multer storage configuration - use memory storage for security scanning
 */
const storage = multer.memoryStorage();

/**
 * File filter for basic validation
 */
const fileFilter = (req, file, cb) => {
  // Validate filename
  const filenameValidation = validateAndSanitizeFilename(file.originalname);

  if (!filenameValidation.valid) {
    return cb(new Error(filenameValidation.error || 'Invalid filename'), false);
  }

  // Check MIME type (will be verified later with file signature)
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(`File type ${file.mimetype} is not allowed. Allowed types: PDF, JPG, PNG, DOCX`),
      false
    );
  }

  cb(null, true);
};

/**
 * Multer configuration
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // Max 5 files per request
    fields: 10, // Max 10 non-file fields
  },
});

/**
 * Error handler for multer errors
 */
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ApiResponse.validationError(res, 'File too large', {
        file: [
          {
            field: 'file',
            message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
          },
        ],
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return ApiResponse.validationError(res, 'Too many files', {
        file: [
          {
            field: 'file',
            message: 'Maximum 5 files allowed per upload',
          },
        ],
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiResponse.validationError(res, 'Unexpected file field', {
        file: [
          {
            field: 'file',
            message: 'Unexpected file field in request',
          },
        ],
      });
    }

    return ApiResponse.validationError(res, 'File upload error', {
      file: [
        {
          field: 'file',
          message: err.message,
        },
      ],
    });
  }

  if (err) {
    // Other errors (from fileFilter)
    return ApiResponse.validationError(res, 'File validation error', {
      file: [
        {
          field: 'file',
          message: err.message,
        },
      ],
    });
  }

  next();
};

/**
 * Single file upload middleware
 */
export const uploadSingle = (fieldName = 'file') => {
  return upload.single(fieldName);
};

/**
 * Multiple files upload middleware
 */
export const uploadMultiple = (fieldName = 'files', maxCount = 5) => {
  return upload.array(fieldName, maxCount);
};

/**
 * Multiple fields upload middleware
 */
export const uploadFields = fields => {
  return upload.fields(fields);
};

export default {
  uploadSingle,
  uploadMultiple,
  uploadFields,
  handleMulterError,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
};
