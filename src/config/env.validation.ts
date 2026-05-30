import Joi from 'joi';

/**
 * Environment variable validation schema.
 * App fails fast on startup if any required variable is missing or invalid.
 */
export const envValidationSchema = Joi.object({
  // ── Database ────────────────────────────────────────────────────────────────
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DATABASE_USERNAME: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // ── Redis ───────────────────────────────────────────────────────────────────
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  // ── JWT ─────────────────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string().min(32).required(),

  // ── Twilio SMS (optional until SMS is used) ────────────────────────────────
  TWILIO_ACCOUNT_SID: Joi.string().optional(),
  TWILIO_AUTH_TOKEN: Joi.string().optional(),
  TWILIO_PHONE_NUMBER: Joi.string().optional(),
  SECRETS_VAULT_KEY: Joi.string().min(32).optional(),
  SECRETS_VAULT_FILE: Joi.string().optional(),
  SECRETS_AUDIT_LOG: Joi.string().optional(),

  // ── Stellar ─────────────────────────────────────────────────────────────────
  STELLAR_NETWORK: Joi.string().valid('testnet', 'mainnet').required(),
  STELLAR_TREASURY_SECRET_KEY: Joi.string().required(),
});

export interface ValidatedEnv {
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  STELLAR_NETWORK: 'testnet' | 'mainnet';
  STELLAR_TREASURY_SECRET_KEY: string;
}

export function validateEnv (): ValidatedEnv {
  const result = envValidationSchema.validate(process.env, {
    stripUnknown: false,
    convert: true,
  });

  if (result.error) {
    const missingVar = result.error.details
      .map((d) => d.message)
      .join('; ');
    throw new Error(
      `Environment validation failed: ${missingVar}\n` +
      `Missing or invalid environment variables detected. ` +
      `Please set all required variables in your .env file.`,
    );
  }

  return result.value as ValidatedEnv;
}
