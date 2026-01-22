/* eslint-disable no-console */

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

export function validateEnv() {
  const errors = [];

  REQUIRED_ENV_VARS.forEach((key) => {
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

  if (errors.length) {
    console.error('\nEnvironment configuration error:\n');
    errors.forEach((err) => console.error(`- ${err}`));
    console.error('\nFix the above and restart the server.\n');
    process.exit(1);
  }
}
