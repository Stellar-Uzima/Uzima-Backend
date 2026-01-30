import { performance } from 'perf_hooks';
import permissionCache from '../services/permissionCache.js';

/**
 * RBAC middleware to check if user has permission for a resource and action
 * @param {string} resource - Resource name (e.g., 'records', 'users')
 * @param {string} action - Action name (e.g., 'read', 'create', 'update', 'delete', 'manage')
 * @returns {Function} Express middleware function
 */
const hasPermission = (resource, action) => {
  return (req, res, next) => {
    const startTime = performance.now();
    const user = req.user;

    if (!user || !user.role) {
      return res.status(403).json({
        error: 'Forbidden: No user role',
        message: 'User authentication or role information is missing',
      });
    }

    // Admin role inherits all permissions
    if (user.role === 'admin') {
      return next();
    }

    // Check permission from cache
    const allowed = permissionCache.hasPermission(user.role, resource, action);
    const duration = performance.now() - startTime;

    // Log if permission check takes longer than 5ms
    if (duration > 5) {
      console.warn(
        `Slow permission check: ${duration.toFixed(2)}ms for ${user.role}:${resource}:${action}`
      );
    }

    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient permissions',
        required: { resource, action },
        userRole: user.role,
      });
    }

    next();
  };
};

export default hasPermission;
