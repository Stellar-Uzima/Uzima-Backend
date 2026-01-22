import Joi from 'joi';

export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).trim().required().messages({
    'string.alphanum': 'Username can only contain alphanumeric characters',
    'string.empty': 'Username is required',
    'string.min': 'Username must be at least 3 characters long',
    'string.max': 'Username must be at most 30 characters long',
  }),

  email: Joi.string().email().trim().required().messages({
    'string.email': 'Invalid email format',
    'string.empty': 'Email is required',
  }),

  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])'))
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must be at most 64 characters long',
      'string.empty': 'Password is required',
    }),

  role: Joi.string().valid('patient', 'doctor', 'educator', 'admin').required().messages({
    'any.only': 'Invalid role specified',
    'string.empty': 'Role is required',
  }),
}).custom((value, helpers) => {
  if (value.password.toLowerCase().includes(value.username.toLowerCase())) {
    return helpers.message('Password cannot contain the username');
  }
  if (value.password.toLowerCase().includes(value.email.toLowerCase())) {
    return helpers.message('Password cannot contain the email');
  }
  return value;
});

export const loginSchema = Joi.object({
  email: Joi.string().email().trim().required().messages({
    'string.email': 'Invalid email format',
    'string.empty': 'Email is required',
  }),

  password: Joi.string().min(8).max(64).required().messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must be at most 64 characters long',
    'string.empty': 'Password is required',
  }),
});

// 2FA Validation Schemas
export const enable2FASchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+[1-9]\d{1,14}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be in international format (e.g., +1234567890)',
      'string.empty': 'Phone number is required',
    }),
});

export const verify2FACodeSchema = Joi.object({
  code: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'Verification code must be 6 digits',
      'string.empty': 'Verification code is required',
    }),
});

export const loginWith2FASchema = Joi.object({
  email: Joi.string().email().trim().required(),
  password: Joi.string().min(8).max(64).required(),
  twoFactorCode: Joi.string().required().messages({
    'string.empty': '2FA code is required',
  }),
  method: Joi.string().valid('sms', 'totp', 'backup').required().messages({
    'any.only': '2FA method must be sms, totp, or backup',
    'string.empty': '2FA method is required',
  }),
  deviceId: Joi.string().optional(),
  rememberDevice: Joi.boolean().default(false),
});

export const disable2FASchema = Joi.object({
  password: Joi.string().min(8).max(64).required().messages({
    'string.empty': 'Password is required to disable 2FA',
  }),
  twoFactorCode: Joi.string().required().messages({
    'string.empty': '2FA code is required to disable 2FA',
  }),
  method: Joi.string().valid('totp', 'backup').required().messages({
    'any.only': '2FA method must be totp or backup',
    'string.empty': '2FA method is required',
  }),
});

// Forgot Password Validation Schema
export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().trim().required().messages({
    'string.email': 'Invalid email format',
    'string.empty': 'Email is required',
  }),
});

// Reset Password Validation Schema
export const resetPasswordSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])'))
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must be at most 64 characters long',
      'string.empty': 'Password is required',
    }),
});

// Change Password Validation Schema (for authenticated users)
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .min(8)
    .max(64)
    .required()
    .messages({
      'string.min': 'Current password must be at least 8 characters long',
      'string.max': 'Current password must be at most 64 characters long',
      'string.empty': 'Current password is required',
    }),

  newPassword: Joi.string()
    .min(8)
    .max(64)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])'))
    .required()
    .invalid(Joi.ref('currentPassword'))
    .messages({
      'string.pattern.base':
        'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.min': 'New password must be at least 8 characters long',
      'string.max': 'New password must be at most 64 characters long',
      'string.empty': 'New password is required',
      'any.invalid': 'New password must be different from current password',
    }),

  confirmPassword: Joi.string()
    .required()
    .valid(Joi.ref('newPassword'))
    .messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Password confirmation is required',
    }),
}).strict();

