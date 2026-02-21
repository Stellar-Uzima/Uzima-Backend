/**
 * Email Template Rendering Service
 *
 * Provides Handlebars-based email template rendering with CSS inlining
 * for maximum email client compatibility.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import juice from 'juice';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Template directory paths
const TEMPLATES_DIR = path.join(__dirname, '../emailTemplates');
const PARTIALS_DIR = path.join(TEMPLATES_DIR, 'partials');

// Cache for compiled templates
const templateCache = new Map();

// Default template data
const DEFAULT_DATA = {
  companyName: 'Uzima Health',
  currentYear: new Date().getFullYear(),
  supportEmail: process.env.SUPPORT_EMAIL || 'support@uzima.health',
};

/**
 * Register Handlebars helpers
 */
function registerHelpers() {
  // Equality helper
  Handlebars.registerHelper('eq', (a, b) => a === b);

  // Not equal helper
  Handlebars.registerHelper('neq', (a, b) => a !== b);

  // OR helper
  Handlebars.registerHelper('or', function (...args) {
    // Remove the options object (last argument)
    args.pop();
    return args.some(Boolean);
  });

  // AND helper
  Handlebars.registerHelper('and', function (...args) {
    args.pop();
    return args.every(Boolean);
  });

  // If greater than
  Handlebars.registerHelper('gt', (a, b) => a > b);

  // If less than
  Handlebars.registerHelper('lt', (a, b) => a < b);

  // Format date helper
  Handlebars.registerHelper('formatDate', (date, format) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;

    const options = {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
      time: { hour: '2-digit', minute: '2-digit' },
      datetime: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      },
    };

    return d.toLocaleDateString('en-US', options[format] || options.short);
  });

  // Uppercase helper
  Handlebars.registerHelper('uppercase', str => (str ? str.toUpperCase() : ''));

  // Lowercase helper
  Handlebars.registerHelper('lowercase', str => (str ? str.toLowerCase() : ''));

  // Capitalize helper
  Handlebars.registerHelper('capitalize', str => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  });

  // Default value helper
  Handlebars.registerHelper('default', (value, defaultValue) => value || defaultValue);

  // JSON stringify helper (for debugging)
  Handlebars.registerHelper('json', context => JSON.stringify(context, null, 2));

  // Truncate text helper
  Handlebars.registerHelper('truncate', (str, length) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  });

  // Pluralize helper
  Handlebars.registerHelper('pluralize', (count, singular, plural) => {
    return count === 1 ? singular : plural || singular + 's';
  });
}

/**
 * Register partials from the partials directory
 */
function registerPartials() {
  if (!fs.existsSync(PARTIALS_DIR)) {
    return;
  }

  const partialFiles = fs.readdirSync(PARTIALS_DIR).filter(file => file.endsWith('.hbs'));

  for (const file of partialFiles) {
    const partialName = path.basename(file, '.hbs');
    const partialPath = path.join(PARTIALS_DIR, file);
    const partialContent = fs.readFileSync(partialPath, 'utf-8');
    Handlebars.registerPartial(partialName, partialContent);
  }
}

/**
 * Initialize the template service
 */
function initialize() {
  registerHelpers();
  registerPartials();
}

// Initialize on module load
initialize();

/**
 * Get compiled template from cache or compile it
 * @param {string} templateName - Name of the template (without .hbs extension)
 * @returns {HandlebarsTemplateDelegate} Compiled template function
 */
function getCompiledTemplate(templateName) {
  // Check cache first
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }

  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template '${templateName}' not found at ${templatePath}`);
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  const compiled = Handlebars.compile(templateContent);

  // Cache the compiled template
  templateCache.set(templateName, compiled);

  return compiled;
}

/**
 * Render an email template with data
 * @param {string} templateName - Name of the template (e.g., 'welcome', 'passwordReset')
 * @param {Object} data - Data to pass to the template
 * @param {Object} options - Rendering options
 * @param {boolean} options.inlineStyles - Whether to inline CSS (default: true)
 * @param {boolean} options.minify - Whether to minify HTML output (default: false)
 * @returns {Promise<{html: string, text: string}>} Rendered HTML and plain text
 */
export async function renderTemplate(templateName, data = {}, options = {}) {
  const { inlineStyles = true, minify = false } = options;

  // Merge default data with provided data
  const templateData = {
    ...DEFAULT_DATA,
    ...data,
  };

  // Get and render the template
  const template = getCompiledTemplate(templateName);
  let html = template(templateData);

  // Inline CSS styles for email client compatibility
  if (inlineStyles) {
    html = juice(html, {
      preserveMediaQueries: true,
      preserveFontFaces: true,
      preserveKeyFrames: true,
      preservePseudos: true,
      removeStyleTags: false,
      applyStyleTags: true,
      insertPreservedExtraCss: true,
    });
  }

  // Optional minification
  if (minify) {
    html = html
      .replace(/\n\s*/g, '')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Generate plain text version
  const text = generatePlainText(templateData, templateName);

  return { html, text };
}

/**
 * Generate plain text version of the email
 * @param {Object} data - Template data
 * @param {string} templateName - Template name for context
 * @returns {string} Plain text email content
 */
function generatePlainText(data, templateName) {
  const lines = [];

  // Header
  if (data.title) {
    lines.push(data.title);
    lines.push('='.repeat(data.title.length));
    lines.push('');
  }

  // Greeting
  if (data.username) {
    lines.push(`Hello ${data.username},`);
    lines.push('');
  }

  // Template-specific content
  switch (templateName) {
    case 'welcome':
      lines.push('Thank you for joining Uzima Health!');
      lines.push('');
      if (data.activationLink) {
        lines.push('To activate your account, visit:');
        lines.push(data.activationLink);
        lines.push('');
        if (data.expiresIn) {
          lines.push(`This link expires in ${data.expiresIn}.`);
          lines.push('');
        }
      }
      break;

    case 'passwordReset':
      lines.push('We received a request to reset your password.');
      lines.push('');
      if (data.resetLink) {
        lines.push('To reset your password, visit:');
        lines.push(data.resetLink);
        lines.push('');
        if (data.expiresIn) {
          lines.push(`This link expires in ${data.expiresIn}.`);
          lines.push('');
        }
      }
      lines.push("If you didn't request this, please ignore this email.");
      break;

    case 'notification':
      if (data.message) {
        // Strip HTML tags from message
        lines.push(data.message.replace(/<[^>]*>/g, ''));
        lines.push('');
      }
      if (data.details) {
        lines.push('Details:');
        for (const detail of data.details) {
          lines.push(`- ${detail.label}: ${detail.value}`);
        }
        lines.push('');
      }
      if (data.actionButton) {
        lines.push(`${data.actionButton.text}: ${data.actionButton.link}`);
        lines.push('');
      }
      break;

    default:
      if (data.message) {
        lines.push(data.message.replace(/<[^>]*>/g, ''));
        lines.push('');
      }
  }

  // Footer
  lines.push('---');
  lines.push(
    `© ${data.currentYear || new Date().getFullYear()} ${data.companyName || 'Uzima Health'}. All rights reserved.`
  );
  lines.push('This is an automated message, please do not reply.');

  return lines.join('\n');
}

/**
 * Get list of available templates
 * @returns {string[]} Array of template names
 */
export function getAvailableTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(TEMPLATES_DIR)
    .filter(
      file => file.endsWith('.hbs') && !fs.statSync(path.join(TEMPLATES_DIR, file)).isDirectory()
    )
    .map(file => path.basename(file, '.hbs'));
}

/**
 * Get template variable documentation
 * @param {string} templateName - Name of the template
 * @returns {Object|null} Documentation object or null if not found
 */
export function getTemplateDocumentation(templateName) {
  const docs = {
    welcome: {
      name: 'welcome',
      description: 'New user welcome email with optional account activation',
      variables: {
        required: {
          username: 'User display name or first name',
        },
        optional: {
          email: 'User email address',
          activationLink: 'URL to activate the account',
          expiresIn: 'Link expiration time (e.g., "24 hours")',
          features: 'Array of feature objects [{title, description}]',
          supportEmail: 'Support email address',
          dashboardLink: 'Link to user dashboard',
          unsubscribeLink: 'Link to unsubscribe from emails',
        },
      },
      example: {
        username: 'John',
        email: 'john@example.com',
        activationLink: 'https://uzima.health/activate?token=xxx',
        expiresIn: '24 hours',
      },
    },
    passwordReset: {
      name: 'passwordReset',
      description: 'Password reset email with security information',
      variables: {
        required: {
          username: 'User display name or first name',
          resetLink: 'URL to reset password page with token',
          expiresIn: 'Link expiration time (e.g., "15 minutes")',
        },
        optional: {
          email: 'User email address',
          ipAddress: 'IP address that requested the reset',
          userAgent: 'Browser/device information',
          requestTime: 'Time when reset was requested',
          supportEmail: 'Support email address',
        },
      },
      example: {
        username: 'John',
        resetLink: 'https://uzima.health/reset-password?token=xxx',
        expiresIn: '15 minutes',
        ipAddress: '192.168.1.1',
        requestTime: '2024-01-15 10:30 AM UTC',
      },
    },
    notification: {
      name: 'notification',
      description: 'General notification/alert email with configurable type',
      variables: {
        required: {
          username: 'User display name or first name',
          title: 'Notification title/header',
          message: 'Main notification message (can include HTML)',
        },
        optional: {
          type: "Notification type: 'info' | 'success' | 'warning' | 'error'",
          actionButton: 'Object with { text, link } for primary CTA',
          secondaryButton: 'Object with { text, link } for secondary action',
          details: 'Array of detail items [{ label, value }]',
          timestamp: 'When the event occurred',
          footer: 'Additional footer text',
          supportEmail: 'Support email address',
          unsubscribeLink: 'Link to manage notification preferences',
        },
      },
      example: {
        username: 'John',
        title: 'Appointment Confirmed',
        type: 'success',
        message: 'Your appointment has been successfully scheduled.',
        details: [
          { label: 'Doctor', value: 'Dr. Smith' },
          { label: 'Date', value: 'January 20, 2024' },
          { label: 'Time', value: '10:00 AM' },
        ],
        actionButton: { text: 'View Appointment', link: 'https://uzima.health/appointments/123' },
      },
    },
  };

  return docs[templateName] || null;
}

/**
 * Clear template cache (useful for development/hot reloading)
 */
export function clearTemplateCache() {
  templateCache.clear();
  // Re-register partials in case they changed
  registerPartials();
}

/**
 * Preview a template with sample data
 * @param {string} templateName - Name of the template
 * @param {Object} customData - Optional custom data to merge with example data
 * @returns {Promise<{html: string, text: string, variables: Object}>}
 */
export async function previewTemplate(templateName, customData = {}) {
  const docs = getTemplateDocumentation(templateName);

  if (!docs) {
    throw new Error(`No documentation found for template '${templateName}'`);
  }

  // Merge example data with custom data
  const previewData = {
    ...docs.example,
    ...customData,
  };

  const rendered = await renderTemplate(templateName, previewData);

  return {
    ...rendered,
    variables: docs.variables,
    exampleData: docs.example,
  };
}

export default {
  renderTemplate,
  getAvailableTemplates,
  getTemplateDocumentation,
  clearTemplateCache,
  previewTemplate,
};
