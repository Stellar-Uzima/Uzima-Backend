/* eslint-disable prettier/prettier */
import express from 'express';
import permissionController from '../controllers/permissionController.js';
import protect from '../middleware/authMiddleware.js';
import hasRole from '../middleware/requireRole.js';
import { validate } from '../middleware/validationMiddleware.js';
import { activityLogger } from '../middleware/activityLogger.js';
import {
  createPermissionSchema,
  updatePermissionSchema,
  getPermissionByIdSchema,
  deletePermissionSchema,
  getRolePermissionsSchema,
  getPermissionsListSchema,
} from '../validations/permissionValidators.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// All permission routes are admin-only
router.use(hasRole('admin'));

/**
 * @swagger
 * /api/permissions:
 *   get:
 *     summary: Get all permissions
 *     description: Retrieve all permissions with optional filtering by resource, action, or role (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource name
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [read, create, update, delete, manage]
 *         description: Filter by action type
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, doctor, educator, patient]
 *         description: Filter by role
 *     responses:
 *       200:
 *         description: List of permissions retrieved successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get(
  '/',
  validate(getPermissionsListSchema),
  activityLogger({ action: 'view_all_permissions' }),
  permissionController.getAllPermissions
);

/**
 * @swagger
 * /api/permissions/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Retrieve permission cache statistics including hit rate and cache size (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get(
  '/cache/stats',
  activityLogger({ action: 'view_cache_stats' }),
  permissionController.getCacheStats
);

/**
 * @swagger
 * /api/permissions/cache/refresh:
 *   post:
 *     summary: Refresh permission cache
 *     description: Manually refresh the permission cache from database (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache refreshed successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/cache/refresh',
  activityLogger({ action: 'refresh_cache' }),
  permissionController.refreshCache
);

/**
 * @swagger
 * /api/permissions/role/{role}:
 *   get:
 *     summary: Get permissions by role
 *     description: Retrieve all permissions assigned to a specific role (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [admin, doctor, educator, patient]
 *         description: Role name
 *     responses:
 *       200:
 *         description: Role permissions retrieved successfully
 *       400:
 *         description: Invalid role
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get(
  '/role/:role',
  validate(getRolePermissionsSchema),
  activityLogger({ action: 'view_role_permissions' }),
  permissionController.getRolePermissions
);

/**
 * @swagger
 * /api/permissions/{id}:
 *   get:
 *     summary: Get permission by ID
 *     description: Retrieve a specific permission by its ID (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Permission ID
 *     responses:
 *       200:
 *         description: Permission retrieved successfully
 *       404:
 *         description: Permission not found
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get(
  '/:id',
  validate(getPermissionByIdSchema),
  activityLogger({ action: 'view_permission' }),
  permissionController.getPermissionById
);

/**
 * @swagger
 * /api/permissions:
 *   post:
 *     summary: Create a new permission
 *     description: Create a new permission with resource, action, and roles (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resource
 *               - action
 *               - roles
 *             properties:
 *               resource:
 *                 type: string
 *                 example: records
 *               action:
 *                 type: string
 *                 enum: [read, create, update, delete, manage]
 *                 example: read
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [admin, doctor, educator, patient]
 *                 example: [admin, doctor]
 *               description:
 *                 type: string
 *                 example: View medical records
 *     responses:
 *       201:
 *         description: Permission created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Permission already exists
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/',
  validate(createPermissionSchema),
  activityLogger({ action: 'create_permission' }),
  permissionController.createPermission
);

/**
 * @swagger
 * /api/permissions/{id}:
 *   put:
 *     summary: Update a permission
 *     description: Update an existing permission (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Permission ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resource:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [read, create, update, delete, manage]
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [admin, doctor, educator, patient]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permission updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Permission not found
 *       409:
 *         description: Permission conflict
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.put(
  '/:id',
  validate(updatePermissionSchema),
  activityLogger({ action: 'update_permission' }),
  permissionController.updatePermission
);

/**
 * @swagger
 * /api/permissions/{id}:
 *   delete:
 *     summary: Delete a permission
 *     description: Delete an existing permission (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Permission ID
 *     responses:
 *       200:
 *         description: Permission deleted successfully
 *       404:
 *         description: Permission not found
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 */
router.delete(
  '/:id',
  validate(deletePermissionSchema),
  activityLogger({ action: 'delete_permission' }),
  permissionController.deletePermission
);

export default router;
