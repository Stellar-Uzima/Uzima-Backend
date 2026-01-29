import crypto from 'crypto';
import path from 'path';

/**
 * Allowed file extensions (whitelist)
 */
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];

/**
 * Dangerous file extensions that should never be allowed
 */
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.js',
  '.vbs',
  '.jar',
  '.sh',
  '.bash',
  '.ps1',
  '.app',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
];

/**
 * Sanitize a filename by removing special characters and limiting length
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unknown';
  }

  // Extract extension
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename, ext);

  // Remove or replace dangerous characters
  // Allow only alphanumeric, hyphen, underscore, and dots
  let sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
    .replace(/\.+/g, '.') // Replace multiple dots with single dot
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^[._-]+/, '') // Remove leading dots, underscores, hyphens
    .replace(/[._-]+$/, ''); // Remove trailing dots, underscores, hyphens

  // Limit length
  const maxLength = 100;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // If sanitization resulted in empty string, use default
  if (!sanitized) {
    sanitized = 'file';
  }

  // Validate extension
  const sanitizedExt = sanitizeExtension(ext);

  return `${sanitized}${sanitizedExt}`;
}

/**
 * Validate and sanitize file extension
 * @param {string} extension - File extension (with or without leading dot)
 * @returns {string} Sanitized extension or empty string if invalid
 */
export function sanitizeExtension(extension) {
  if (!extension || typeof extension !== 'string') {
    return '';
  }

  // Ensure extension starts with dot
  let ext = extension.trim().toLowerCase();
  if (!ext.startsWith('.')) {
    ext = `.${ext}`;
  }

  // Check against whitelist
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return '';
  }

  // Normalize .jpeg to .jpg
  if (ext === '.jpeg') {
    return '.jpg';
  }

  return ext;
}

/**
 * Generate UUID-based filename while preserving extension
 * @param {string} originalFilename - Original filename
 * @param {string} userId - User ID for additional namespacing
 * @returns {Object} Result with UUID filename and metadata
 */
export function generateUUIDFilename(originalFilename, userId = null) {
  const sanitized = sanitizeFilename(originalFilename);
  const ext = path.extname(sanitized);

  // Validate extension
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid or unsupported file extension: ${ext || 'none'}`);
  }

  // Generate UUID
  const uuid = crypto.randomUUID();

  // Create UUID-based filename
  const uuidFilename = `${uuid}${ext}`;

  // Create a path prefix with user ID if provided (for organized storage)
  const prefix = userId ? `users/${userId}` : 'uploads';

  return {
    uuidFilename,
    sanitizedOriginal: sanitized,
    extension: ext,
    fullPath: `${prefix}/${uuidFilename}`,
    uuid,
  };
}

/**
 * Detect double extensions or suspicious patterns
 * @param {string} filename - Filename to check
 * @returns {Object} Detection result
 */
export function detectSuspiciousFilename(filename) {
  const issues = [];

  // Check for double extensions (e.g., file.pdf.exe)
  const matches = filename.match(/\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/);
  if (matches) {
    issues.push('Double extension detected');
  }

  // Check for dangerous extensions anywhere in the filename
  for (const dangerousExt of DANGEROUS_EXTENSIONS) {
    if (filename.toLowerCase().includes(dangerousExt)) {
      issues.push(`Dangerous extension detected: ${dangerousExt}`);
    }
  }

  // Check for null bytes (path traversal attempt)
  if (filename.includes('\0')) {
    issues.push('Null byte detected');
  }

  // Check for path traversal patterns
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    issues.push('Path traversal pattern detected');
  }

  // Check for extremely long filenames
  if (filename.length > 255) {
    issues.push('Filename exceeds maximum length');
  }

  // Check for hidden files (starting with dot)
  if (path.basename(filename).startsWith('.')) {
    issues.push('Hidden file detected');
  }

  return {
    suspicious: issues.length > 0,
    issues,
    safe: issues.length === 0,
  };
}

/**
 * Complete filename validation and sanitization
 * @param {string} filename - Filename to validate
 * @returns {Object} Validation result
 */
export function validateAndSanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return {
      valid: false,
      error: 'Filename is required and must be a string',
      sanitized: null,
    };
  }

  // Check for suspicious patterns
  const suspiciousCheck = detectSuspiciousFilename(filename);
  if (suspiciousCheck.suspicious) {
    return {
      valid: false,
      error: 'Suspicious filename detected',
      issues: suspiciousCheck.issues,
      sanitized: null,
    };
  }

  // Sanitize filename
  const sanitized = sanitizeFilename(filename);

  // Extract and validate extension
  const ext = path.extname(sanitized);
  if (!ext) {
    return {
      valid: false,
      error: 'File extension is required',
      sanitized: null,
    };
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File extension ${ext} is not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      sanitized: null,
    };
  }

  return {
    valid: true,
    error: null,
    sanitized,
    extension: ext,
  };
}

/**
 * Get file extension validation regex
 * @returns {RegExp} Regex pattern for allowed extensions
 */
export function getAllowedExtensionPattern() {
  const escapedExts = ALLOWED_EXTENSIONS.map(ext => ext.replace('.', '\\.'));
  return new RegExp(`(${escapedExts.join('|')})$`, 'i');
}

export default {
  sanitizeFilename,
  sanitizeExtension,
  generateUUIDFilename,
  detectSuspiciousFilename,
  validateAndSanitizeFilename,
  getAllowedExtensionPattern,
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
};
