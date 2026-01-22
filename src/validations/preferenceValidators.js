import Joi from 'joi';

const preferencesSchema = Joi.object({
  notifications: Joi.object({
    email: Joi.boolean().default(true),
    push: Joi.boolean().default(true),
    sms: Joi.boolean().default(false),
    marketing: Joi.boolean().default(false),
    appointments: Joi.boolean().default(true),
    prescriptions: Joi.boolean().default(true),
    labResults: Joi.boolean().default(true),
  }).default(),

  ui: Joi.object({
    theme: Joi.string().valid('light', 'dark', 'auto').default('light'),
    language: Joi.string()
      .valid('en', 'es', 'fr', 'de', 'it', 'pt', 'sw', 'ar', 'hi', 'zh')
      .default('en'),
    timezone: Joi.string().default('UTC'),
    dateFormat: Joi.string()
      .valid('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY')
      .default('MM/DD/YYYY'),
    timeFormat: Joi.string().valid('12h', '24h').default('12h'),
  }).default(),

  privacy: Joi.object({
    profileVisibility: Joi.string().valid('public', 'private', 'friends').default('public'),
    shareData: Joi.boolean().default(true),
    analytics: Joi.boolean().default(true),
  }).default(),

  accessibility: Joi.object({
    fontSize: Joi.string().valid('small', 'medium', 'large', 'extra-large').default('medium'),
    highContrast: Joi.boolean().default(false),
    screenReader: Joi.boolean().default(false),
  }).default(),
}).default();

const preferenceUpdateSchema = Joi.object({
  path: Joi.string()
    .required()
    .pattern(/^([a-zA-Z][a-zA-Z0-9_]*\.?)*[a-zA-Z][a-zA-Z0-9_]*$/),
  value: Joi.any().required(),
});

const preferenceMergeSchema = Joi.object({
  preferences: preferencesSchema.required(),
});

export { preferencesSchema, preferenceUpdateSchema, preferenceMergeSchema };
