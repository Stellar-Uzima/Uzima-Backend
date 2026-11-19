// Notification template validation and versioning. Closes #1559, #1560.
const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;
const SUPPORTED_TYPES = ['email', 'sms', 'push', 'in_app'];
const SUPPORTED_LOCALES = ['en', 'fr', 'sw', 'ha', 'yo'];

const extractVariables = (body) => [...String(body).matchAll(VARIABLE_PATTERN)].map((m) => m[1]);

// Run before provider submission; returns the problems found.
function validateTemplate(template, variables = {}) {
  const errors = [];
  if (!SUPPORTED_TYPES.includes(template.type)) errors.push(`unsupported type: ${template.type}`);
  if (!SUPPORTED_LOCALES.includes(template.locale)) errors.push(`unsupported locale: ${template.locale}`);
  const missing = extractVariables(template.body).filter((v) => variables[v] === undefined);
  if (missing.length) errors.push(`missing variables: ${[...new Set(missing)].join(', ')}`);
  return { valid: errors.length === 0, errors };
}

const render = (body, variables) => String(body).replace(VARIABLE_PATTERN, (_, k) => variables[k]);

// Each edit becomes a new version with an effective date; earlier versions are kept.
const addVersion = (versions, body, effectiveFrom = new Date()) => [
  ...versions,
  { version: versions.length + 1, body, effectiveFrom: new Date(effectiveFrom) },
];

// Documented behavior: a notification uses the version that was effective when it was QUEUED.
function versionForQueuedAt(versions, queuedAt) {
  const eligible = versions.filter((v) => v.effectiveFrom <= new Date(queuedAt));
  return eligible.length ? eligible[eligible.length - 1] : versions[0];
}

module.exports = { extractVariables, validateTemplate, render, addVersion, versionForQueuedAt };
