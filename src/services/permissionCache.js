/* eslint-disable prettier/prettier */
import Permission from '../models/Permission.js';

class PermissionCache {
  constructor() {
    // Cache structure: Map<'role:resource:action', boolean>
    this.cache = new Map();
    // Store full permission documents: Map<'resource:action', Permission>
    this.permissions = new Map();
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      lastRefresh: null,
    };
    // Auto-refresh interval (5 minutes)
    this.refreshInterval = 5 * 60 * 1000;
    this.refreshTimer = null;
  }

  /**
   * Initialize cache by loading all permissions from database
   */
  async initialize() {
    try {
      const permissions = await Permission.find({});
      console.log(`Loading ${permissions.length} permissions into cache...`);

      for (const permission of permissions) {
        this.add(permission);
      }

      this.metrics.lastRefresh = new Date();
      console.log(`Permission cache initialized with ${this.cache.size} entries`);

      // Set up auto-refresh
      this.startAutoRefresh();

      return true;
    } catch (error) {
      console.error('Failed to initialize permission cache:', error);
      throw error;
    }
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        console.log('Auto-refreshing permission cache...');
        await this.refresh();
      } catch (error) {
        console.error('Failed to auto-refresh permission cache:', error);
      }
    }, this.refreshInterval);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Refresh cache from database
   */
  async refresh() {
    this.invalidate();
    await this.initialize();
  }

  /**
   * Check if a role has permission for a resource and action
   * @param {string} role - User role
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {boolean} - True if permission exists
   */
  hasPermission(role, resource, action) {
    const cacheKey = `${role}:${resource}:${action}`;
    
    if (this.cache.has(cacheKey)) {
      this.metrics.hits++;
      return this.cache.get(cacheKey);
    }

    this.metrics.misses++;
    return false;
  }

  /**
   * Add a permission to the cache
   * @param {Object} permission - Permission document
   */
  add(permission) {
    const permKey = `${permission.resource}:${permission.action}`;
    this.permissions.set(permKey, permission);

    // Create cache entries for all roles
    for (const role of permission.roles) {
      const cacheKey = `${role}:${permission.resource}:${permission.action}`;
      this.cache.set(cacheKey, true);
    }
  }

  /**
   * Remove a permission from the cache
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   */
  remove(resource, action) {
    const permKey = `${resource}:${action}`;
    const permission = this.permissions.get(permKey);

    if (permission) {
      // Remove cache entries for all roles
      for (const role of permission.roles) {
        const cacheKey = `${role}:${resource}:${action}`;
        this.cache.delete(cacheKey);
      }
      this.permissions.delete(permKey);
    }
  }

  /**
   * Update a permission in the cache
   * @param {Object} permission - Updated permission document
   */
  update(permission) {
    // Remove old entries
    this.remove(permission.resource, permission.action);
    // Add new entries
    this.add(permission);
  }

  /**
   * Clear the entire cache
   */
  invalidate() {
    this.cache.clear();
    this.permissions.clear();
    console.log('Permission cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache metrics
   */
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;

    return {
      size: this.cache.size,
      permissionsCount: this.permissions.size,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: hitRate.toFixed(2) + '%',
      lastRefresh: this.metrics.lastRefresh,
    };
  }

  /**
   * Get all permissions for a specific role
   * @param {string} role - Role name
   * @returns {Array} - Array of permissions
   */
  getPermissionsByRole(role) {
    const rolePermissions = [];
    
    for (const [key, permission] of this.permissions) {
      if (permission.roles.includes(role)) {
        rolePermissions.push({
          resource: permission.resource,
          action: permission.action,
          description: permission.description,
        });
      }
    }

    return rolePermissions;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics.hits = 0;
    this.metrics.misses = 0;
  }
}

// Create singleton instance
const permissionCache = new PermissionCache();

export default permissionCache;
