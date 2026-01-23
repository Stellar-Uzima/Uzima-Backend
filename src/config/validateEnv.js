/* eslint-disable no-console */

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'];

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

export function validateEnv() {
  const errors = [];
  const warnings = [];

  REQUIRED_ENV_VARS.forEach((key) => {
    if (!process.env[key] || process.env[key].trim() === '') {
      errors.push(`Missing required env variable: ${key}`);
    }
  });

  if (process.env.DATABASE_URL && !isValidUrl(process.env.DATABASE_URL)) {
    errors.push('DATABASE_URL is not a valid URL');
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
    warnings.forEach((warn) => console.warn(`- ${warn}`));
    console.warn('');
  }

  if (errors.length) {
    console.error('\nEnvironment configuration error:\n');
    errors.forEach((err) => console.error(`- ${err}`));
    console.error('\nFix the above and restart the server.\n');
    process.exit(1);
  }
}
