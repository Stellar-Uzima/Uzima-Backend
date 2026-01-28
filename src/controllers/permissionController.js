/* eslint-disable prettier/prettier */
import Permission from '../models/Permission.js';
import permissionCache from '../services/permissionCache.js';

/**
 * Get all permissions
 * @route GET /api/permissions
 * @access Admin only
 */
const getAllPermissions = async (req, res) => {
  try {
    const { resource, action, role } = req.query;
    const filter = {};

    if (resource) {
      filter.resource = resource;
    }
    if (action) {
      filter.action = action;
    }
    if (role) {
      filter.roles = role;
    }

    const permissions = await Permission.find(filter).sort({ resource: 1, action: 1 });

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions,
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch permissions',
      message: error.message,
    });
  }
};

/**
 * Get permission by ID
 * @route GET /api/permissions/:id
 * @access Admin only
 */
const getPermissionById = async (req, res) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findById(id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found',
      });
    }

    res.status(200).json({
      success: true,
      data: permission,
    });
  } catch (error) {
    console.error('Error fetching permission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch permission',
      message: error.message,
    });
  }
};

/**
 * Get all permissions for a specific role
 * @route GET /api/permissions/role/:role
 * @access Admin only
 */
const getRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;

    // Validate role
    const validRoles = ['admin', 'doctor', 'educator', 'patient'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
        validRoles,
      });
    }

    const permissions = await Permission.findByRole(role);

    res.status(200).json({
      success: true,
      role,
      count: permissions.length,
      data: permissions,
    });
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role permissions',
      message: error.message,
    });
  }
};

/**
 * Create a new permission
 * @route POST /api/permissions
 * @access Admin only
 */
const createPermission = async (req, res) => {
  try {
    const { resource, action, roles, description } = req.body;

    // Check if permission already exists
    const existingPermission = await Permission.findByResourceAction(resource, action);
    if (existingPermission) {
      return res.status(409).json({
        success: false,
        error: 'Permission already exists',
        message: `Permission for ${resource}:${action} already exists`,
      });
    }

    // Create new permission
    const permission = await Permission.create({
      resource,
      action,
      roles,
      description,
    });

    // Add to cache
    permissionCache.add(permission);

    res.status(201).json({
      success: true,
      message: 'Permission created successfully',
      data: permission,
    });
  } catch (error) {
    console.error('Error creating permission:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create permission',
      message: error.message,
    });
  }
};

/**
 * Update an existing permission
 * @route PUT /api/permissions/:id
 * @access Admin only
 */
const updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { resource, action, roles, description } = req.body;

    // Find existing permission
    const permission = await Permission.findById(id);
    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found',
      });
    }

    // Check if updating to a resource:action that already exists (different from current)
    if (resource || action) {
      const targetResource = resource || permission.resource;
      const targetAction = action || permission.action;

      if (targetResource !== permission.resource || targetAction !== permission.action) {
        const existingPermission = await Permission.findByResourceAction(targetResource, targetAction);
        if (existingPermission) {
          return res.status(409).json({
            success: false,
            error: 'Permission conflict',
            message: `Permission for ${targetResource}:${targetAction} already exists`,
          });
        }
      }
    }

    // Update fields
    if (resource) permission.resource = resource;
    if (action) permission.action = action;
    if (roles) permission.roles = roles;
    if (description !== undefined) permission.description = description;

    await permission.save();

    // Update cache
    permissionCache.update(permission);

    res.status(200).json({
      success: true,
      message: 'Permission updated successfully',
      data: permission,
    });
  } catch (error) {
    console.error('Error updating permission:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update permission',
      message: error.message,
    });
  }
};

/**
 * Delete a permission
 * @route DELETE /api/permissions/:id
 * @access Admin only
 */
const deletePermission = async (req, res) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findById(id);
    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'Permission not found',
      });
    }

    // Remove from cache
    permissionCache.remove(permission.resource, permission.action);

    // Delete from database
    await permission.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Permission deleted successfully',
      deletedPermission: {
        resource: permission.resource,
        action: permission.action,
      },
    });
  } catch (error) {
    console.error('Error deleting permission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete permission',
      message: error.message,
    });
  }
};

/**
 * Get cache statistics
 * @route GET /api/permissions/cache/stats
 * @access Admin only
 */
const getCacheStats = async (req, res) => {
  try {
    const stats = permissionCache.getMetrics();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cache statistics',
      message: error.message,
    });
  }
};

/**
 * Refresh permission cache
 * @route POST /api/permissions/cache/refresh
 * @access Admin only
 */
const refreshCache = async (req, res) => {
  try {
    await permissionCache.refresh();

    res.status(200).json({
      success: true,
      message: 'Permission cache refreshed successfully',
      stats: permissionCache.getMetrics(),
    });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh cache',
      message: error.message,
    });
  }
};

export default {
  getAllPermissions,
  getPermissionById,
  getRolePermissions,
  createPermission,
  updatePermission,
  deletePermission,
  getCacheStats,
  refreshCache,
};
