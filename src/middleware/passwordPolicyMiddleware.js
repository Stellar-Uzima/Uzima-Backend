/* eslint-disable prettier/prettier */
import ApiResponse from '../utils/apiResponse.js';
import PasswordPolicyService from '../services/passwordPolicyService.js';

/**
 * Middleware to check password expiry and force password change
 * Should be applied after authentication middleware
 */
export const checkPasswordExpiry = async (req, res, next) => {
  try {
    // Skip if no user is authenticated
    if (!req.user) {
      return next();
    }

    const user = req.user;

    // Get password status
    const passwordStatus = PasswordPolicyService.getPasswordStatus(user);

    // Attach password status to request for use in controllers
    req.passwordStatus = passwordStatus;

    // If password change is required, don't allow any other operations
    if (passwordStatus.requiresChange) {
      return ApiResponse.error(
        res,
        'Password change is required. Please update your password.',
        403
      );
    }

    // If password is expired, return warning in response headers
    if (passwordStatus.isExpired) {
      res.setHeader('X-Password-Expired', 'true');
      return ApiResponse.error(
        res,
        'Your password has expired. Please change it immediately.',
        403
      );
    }

    // If password expiry is approaching, add warning header
    if (passwordStatus.expiryWarning) {
      res.setHeader('X-Password-Expiry-Warning', passwordStatus.expiryWarning);
      res.setHeader('X-Password-Days-Until-Expiry', passwordStatus.daysUntilExpiry);
    }

    next();
  } catch (error) {
    console.error('Error checking password expiry:', error.message);
    return ApiResponse.error(res, 'Error checking password status', 500);
  }
};

/**
 * Middleware to check account lock status
 * Should be applied before login/authentication attempts
 */
export const checkAccountLock = async (req, res, next) => {
  try {
    // Skip if no user is authenticated
    if (!req.user) {
      return next();
    }

    const user = req.user;
    const isLocked = PasswordPolicyService.isAccountLocked(user);

    if (isLocked) {
      const lockTimeRemaining = PasswordPolicyService.getLockTimeRemaining(user);
      return ApiResponse.error(
        res,
        `Account is locked. Try again in ${lockTimeRemaining} minutes.`,
        429
      );
    }

    next();
  } catch (error) {
    console.error('Error checking account lock:', error.message);
    return ApiResponse.error(res, 'Error checking account status', 500);
  }
};

/**
 * Middleware to inject password status into response
 * Attaches password expiry info to successful responses
 */
export const injectPasswordStatus = (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to inject password status
  res.json = function (data) {
    // Only inject if it's a success response (2xx status)
    if (res.statusCode >= 200 && res.statusCode < 300 && req.passwordStatus) {
      // Add password status to response data
      if (typeof data === 'object' && data !== null) {
        data.passwordStatus = {
          requiresChange: req.passwordStatus.requiresChange,
          daysUntilExpiry: req.passwordStatus.daysUntilExpiry,
          expiryWarning: req.passwordStatus.expiryWarning,
          isExpired: req.passwordStatus.isExpired,
        };
      }
    }

    return originalJson(data);
  };

  next();
};

export default {
  checkPasswordExpiry,
  checkAccountLock,
  injectPasswordStatus,
};
