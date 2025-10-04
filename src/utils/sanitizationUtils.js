/**
 * HTML sanitization utilities for input cleaning
 */
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

// Create module-level cached DOMPurify instance for performance
const { window } = new JSDOM('');
const purify = DOMPurify(window);

/**
 * Remove null bytes and other dangerous characters from input
 * @param {string} input - Input string to clean
 * @returns {string} Cleaned string
 */
const removeNullBytes = input => {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove null bytes and dangerous control characters
  let cleaned = input.replace(/\0/g, '');

  // Remove control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return cleaned;
};

/**
 * Strip HTML tags and decode HTML entities from a string
 * @param {string} html - HTML string to sanitize
 * @returns {string} Plain text string
 */
export const sanitizeHtml = html => {
  if (typeof html !== 'string') {
    return html;
  }

  // Remove script tags and their content first
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove other dangerous tags
  cleaned = cleaned.replace(/<(iframe|object|embed|link|meta)\b[^>]*>/gi, '');

  // Decode HTML entities
  const decoded = cleaned.replace(/&[#\w]+;/g, entity => {
    const textarea = window.document.createElement('textarea');
    textarea.innerHTML = entity;
    return textarea.textContent;
  });

  // Remove remaining HTML tags
  const stripped = decoded.replace(/<[^>]*>/g, '');

  return stripped;
};

/**
 * Sanitize input to prevent XSS attacks using DOMPurify
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeXSS = input => {
  if (typeof input !== 'string') {
    return input;
  }

  // First, remove null bytes and dangerous control characters
  const cleanedInput = removeNullBytes(input);

  // Use cached DOMPurify instance

  // Configure DOMPurify to be very restrictive
  const config = {
    // Disallow all script tags and their content
    FORBID_TAGS: ['script', 'object', 'embed', 'link', 'meta', 'iframe', 'frame', 'frameset'],
    // Disallow all event handler attributes
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onchange',
      'onsubmit',
      'onreset',
      'onselect',
      'onkeydown',
      'onkeypress',
      'onkeyup',
      'onmousedown',
      'onmouseup',
      'onmousemove',
      'onmouseout',
      'onmouseenter',
      'onmouseleave',
      'ondblclick',
      'oncontextmenu',
      'onwheel',
      'oninput',
      'oninvalid',
      'onreset',
      'onsearch',
      'onselectstart',
      'ontoggle',
      'onabort',
      'oncanplay',
      'oncanplaythrough',
      'ondurationchange',
      'onemptied',
      'onended',
      'onerror',
      'onloadeddata',
      'onloadedmetadata',
      'onloadstart',
      'onpause',
      'onplay',
      'onplaying',
      'onprogress',
      'onratechange',
      'onseeked',
      'onseeking',
      'onstalled',
      'onsuspend',
      'ontimeupdate',
      'onvolumechange',
      'onwaiting',
    ],
    // Remove dangerous protocols
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    // Don't allow data URIs except for safe image types
    ALLOW_DATA_ATTR: false,
    // Sanitize CSS
    SANITIZE_DOM: true,
    // Keep only safe attributes
    ALLOWED_ATTR: ['href', 'title', 'alt', 'class', 'id', 'style'],
    // Allow only safe tags
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'img',
    ],
    // Remove empty elements
    REMOVE_EMPTY_ELEMENTS: true,
    // Return only the text content if HTML is completely removed
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false,
  };

  try {
    // Sanitize the input
    const sanitized = purify.sanitize(cleanedInput, config);

    // Additional safety: remove any remaining javascript: protocols
    return sanitized.replace(/javascript:/gi, '');
  } catch (error) {
    // If DOMPurify fails, fall back to basic cleaning
    // eslint-disable-next-line no-console
    console.warn('DOMPurify sanitization failed, falling back to basic cleaning:', error.message);
    return cleanedInput
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  }
};

/**
 * Normalize string input
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
export const normalizeString = str => {
  if (typeof str !== 'string') {
    return str;
  }

  // First remove null bytes and dangerous control characters
  let cleaned = removeNullBytes(str);

  return (
    cleaned
      // Normalize Unicode
      .normalize('NFC')
      // Trim whitespace
      .trim()
      // Replace multiple whitespace with single space
      .replace(/\s+/g, ' ')
      // Remove remaining control characters except newlines and tabs
      .replace(/[\p{Cc}]/gu, match => (match === '\n' || match === '\t' ? match : ''))
  );
};

/**
 * Sanitize filename to prevent directory traversal
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
export const sanitizeFilename = filename => {
  if (typeof filename !== 'string') {
    return '';
  }

  // First remove null bytes and dangerous control characters
  let cleaned = removeNullBytes(filename);

  // Windows reserved names that must be avoided
  const windowsReservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];

  let sanitized = cleaned
    // Remove directory traversal attempts (collapse runs of 2+ dots)
    .replace(/\.{2,}/g, '')
    // Normalize path separators
    .replace(/[/\\]/g, '_')
    // Remove remaining control characters
    .replace(/[\p{Cc}]/gu, '')
    // Limit length
    .substring(0, 255)
    .trim();

  // Check against Windows reserved names (case-insensitive)
  const normalizedName = sanitized.toUpperCase();
  if (windowsReservedNames.includes(normalizedName)) {
    // Prefix with underscore to avoid reserved name conflict
    sanitized = '_' + sanitized;
  }

  return sanitized;
};

/**
 * Comprehensive sanitization function
 * @param {string} input - Input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized input
 *
 * Note: This function does NOT provide SQL injection protection.
 * Always use parameterized queries/prepared statements for database operations.
 */
export const sanitizeInput = (input, options = {}) => {
  if (typeof input !== 'string') {
    return input;
  }

  const { stripHtml = true, preventXSS = true, normalize = true, maxLength = null } = options;

  let sanitized = input;

  if (stripHtml) {
    sanitized = sanitizeHtml(sanitized);
  }

  if (preventXSS) {
    sanitized = sanitizeXSS(sanitized);
  }

  if (normalize) {
    sanitized = normalizeString(sanitized);
  }

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
};
