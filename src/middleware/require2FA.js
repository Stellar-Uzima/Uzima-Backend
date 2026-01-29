/**
 * Middleware to require 2FA verification for sensitive operations
 * 
 * This middleware ensures that if a user has 2FA enabled, they must have
 * completed 2FA verification in their current session (indicated by the
 * twoFactorVerified claim in their JWT token).
 * 
 * Usage: Apply to routes that perform sensitive operations like:
 * - Password changes
 * - Email updates
 * - Account deletion
 * - Financial operations
 */

import ApiResponse from '../utils/apiResponse.js';

export const require2FA = async (req, res, next) => {
  // Check if user is authenticated (should be handled by protect middleware first)
  if (!req.user) {
    return ApiResponse.error(res, 'Authentication required', 401);
  }

  // Check if user has 2FA enabled
  const has2FAEnabled = req.user.twoFactor?.enabled === true;

  if (!has2FAEnabled) {
    // User doesn't have 2FA enabled, allow the request
    return next();
  }

  // User has 2FA enabled - check if they verified it in this session
  // The twoFactorVerified claim is set in the JWT when user completes 2FA login
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return ApiResponse.error(res, '2FA verification required', 403);
  }

  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'secret');

    if (decoded.twoFactorEnabled && !decoded.twoFactorVerified) {
      return ApiResponse.error(
        res,
        '2FA verification required for this operation',
        403
      );
    }

    // 2FA is verified, proceed
    next();
  } catch (error) {
    return ApiResponse.error(res, 'Invalid token', 401);
  }
};

export default require2FA;
