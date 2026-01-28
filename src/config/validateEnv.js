/**
 * Environment Validation
 *
 * This module provides a wrapper around the new unified config loader.
 * The actual validation is now performed by Joi in src/config/index.js.
 *
 * @deprecated Use initConfig() or getConfig() from './index.js' directly.
 * This file is kept for backward compatibility.
 */

const REQUIRED_ENV_VARS = ['MONGO_URI', 'JWT_SECRET'];

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536;
}
import { initConfig } from './index.js';

/**
 * Validate environment variables.
 * Initializes the config system and validates all env vars using Joi.
 *
 * @throws {Error} If required environment variables are missing or invalid
 * @deprecated Use initConfig() from './index.js' directly
 */
export function validateEnv() {
  const errors = [];
  const warnings = [];

  REQUIRED_ENV_VARS.forEach(key => {
    if (!process.env[key] || process.env[key].trim() === '') {
      errors.push(`Missing required env variable: ${key}`);
    }
  });

  if (process.env.MONGO_URI && !isValidUrl(process.env.MONGO_URI)) {
    errors.push('MONGO_URI is not a valid URL');
  }

  if (process.env.PORT && !isValidPort(process.env.PORT)) {
    errors.push('PORT must be a valid number');
  }

  // Optional Elasticsearch validation
  if (process.env.ELASTICSEARCH_NODE && !isValidUrl(process.env.ELASTICSEARCH_NODE)) {
    warnings.push('ELASTICSEARCH_NODE is not a valid URL. Search features may not work.');
  }

  if (process.env.ELASTICSEARCH_REQUEST_TIMEOUT) {
    const timeout = Number(process.env.ELASTICSEARCH_REQUEST_TIMEOUT);
    if (!Number.isInteger(timeout) || timeout < 0) {
      warnings.push('ELASTICSEARCH_REQUEST_TIMEOUT must be a positive number');
    }
  }

  if (process.env.ELASTICSEARCH_MAX_RETRIES) {
    const retries = Number(process.env.ELASTICSEARCH_MAX_RETRIES);
    if (!Number.isInteger(retries) || retries < 0) {
      warnings.push('ELASTICSEARCH_MAX_RETRIES must be a positive number');
    }
  }

  // Display warnings
  if (warnings.length) {
    console.warn('\n⚠️  Environment configuration warnings:\n');
    warnings.forEach(warn => console.warn(`- ${warn}`));
    console.warn('');
  }

  if (errors.length) {
    console.error('\nEnvironment configuration error:\n');
    errors.forEach(err => console.error(`- ${err}`));
    console.error('\nFix the above and restart the server.\n');
    process.exit(1);
  }
  initConfig();
}

export default validateEnv;
