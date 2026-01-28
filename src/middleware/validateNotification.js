import {
  sendEmailSchema,
  listNotificationsSchema,
  notificationIdSchema,
} from '../validations/notificationValidation.js';

/**
 * Middleware to validate email notification request
 */
export function validateSendEmail(req, res, next) {
  const { error, value } = sendEmailSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.body = value;
  next();
}

/**
 * Middleware to validate list notifications query
 */
export function validateListNotifications(req, res, next) {
  const { error, value } = listNotificationsSchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.query = value;
  next();
}

/**
 * Middleware to validate notification ID parameter
 */
export function validateNotificationId(req, res, next) {
  const { error, value } = notificationIdSchema.validate(req.params, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.params = value;
  next();
}

export default {
  validateSendEmail,
  validateListNotifications,
  validateNotificationId,
};
