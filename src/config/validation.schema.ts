import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB2DATABASE: Joi.string().required(),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().default('7d'),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // Mail (optional)
  MAIL_HOST: Joi.string().optional(),
  MAIL_PORT: Joi.number().optional(),
  MAIL_USER: Joi.string().optional(),
  MAIL_PASSWORD: Joi.string().optional(),

  // Twilio SMS (optional until SMS is used)
  TWILIO_ACCOUNT_SID: Joi.string().optional(),
  TWILIO_AUTH_TOKEN: Joi.string().optional(),
  TWILIO_PHONE_NUMBER: Joi.string().optional(),

  // External call resilience (issue #140)
  EXTERNAL_REQUEST_TIMEOUT_MS: Joi.number().integer().positive().default(10000),
  EXTERNAL_CIRCUIT_FAILURE_THRESHOLD: Joi.number().integer().positive().default(5),
  EXTERNAL_CIRCUIT_RESET_MS: Joi.number().integer().positive().default(30000),
  NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD: Joi.number().integer().positive().default(5),
  NOTIFICATION_CIRCUIT_RESET_MS: Joi.number().integer().positive().default(30000),
});
