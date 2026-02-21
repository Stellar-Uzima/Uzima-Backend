import Tenant from '../models/Tenant.js';

/**
 * Middleware to extract tenantId from JWT and attach to request
 * Must be used after authMiddleware
 */
export const extractTenant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Extract tenantId from JWT token payload
  const tenantId = req.user.tenantId;

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant ID required in token' });
  }

  req.tenantId = tenantId;
  next();
};

/**
 * Middleware to validate tenant is active
 */
export const validateTenant = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(403).json({ error: 'Tenant ID not set' });
    }

    const tenant = await Tenant.findById(req.tenantId);

    if (!tenant) {
      return res.status(403).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'active') {
      return res.status(403).json({ error: `Tenant is ${tenant.status}` });
    }

    req.tenant = tenant;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Error validating tenant' });
  }
};

/**
 * Middleware to inject tenant filter into query
 * Use this before controllers that need tenant isolation
 */
export const injectTenantFilter = (req, res, next) => {
  if (!req.tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  // Store original query method
  const originalFind = req.model?.find;
  const originalFindOne = req.model?.findOne;
  const originalCountDocuments = req.model?.countDocuments;

  // Override query methods to include tenant filter
  if (req.model) {
    const tenantFilter = { tenantId: req.tenantId };

    req.model.find = function (query = {}, ...args) {
      return originalFind.call(this, { ...query, ...tenantFilter }, ...args);
    };

    req.model.findOne = function (query = {}, ...args) {
      return originalFindOne.call(this, { ...query, ...tenantFilter }, ...args);
    };

    req.model.countDocuments = function (query = {}, ...args) {
      return originalCountDocuments.call(this, { ...query, ...tenantFilter }, ...args);
    };
  }

  next();
};

/**
 * Helper to add tenant filter to any query object
 */
export const withTenantFilter = (query, tenantId) => {
  return { ...query, tenantId };
};

/**
 * Middleware to ensure user can only access their own tenant's data
 * Cross-tenant access prevention
 */
export const preventCrossTenantAccess = (req, res, next) => {
  if (!req.user || !req.tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  // If user has a tenantId in their token, ensure it matches the request tenant
  if (req.user.tenantId && req.user.tenantId.toString() !== req.tenantId.toString()) {
    return res.status(403).json({ error: 'Cross-tenant access denied' });
  }

  next();
};
