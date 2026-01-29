/* eslint-disable prettier/prettier */
/**
 * @swagger
 * components:
 *   schemas:
 *     Permission:
 *       type: object
 *       required:
 *         - resource
 *         - action
 *         - roles
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated ID of the permission
 *           example: 507f1f77bcf86cd799439011
 *         resource:
 *           type: string
 *           description: The resource being protected
 *           example: records
 *           pattern: ^[a-z0-9-_]+$
 *         action:
 *           type: string
 *           description: The action allowed on the resource
 *           enum: [read, create, update, delete, manage]
 *           example: read
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *             enum: [admin, doctor, educator, patient]
 *           description: Roles that have this permission
 *           example: [admin, doctor]
 *         description:
 *           type: string
 *           description: Human-readable description of the permission
 *           example: View medical records
 *           maxLength: 200
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date the permission was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The date the permission was last updated
 *
 *     PermissionInput:
 *       type: object
 *       required:
 *         - resource
 *         - action
 *         - roles
 *       properties:
 *         resource:
 *           type: string
 *           description: The resource being protected (lowercase, alphanumeric with hyphens/underscores)
 *           example: records
 *           pattern: ^[a-z0-9-_]+$
 *         action:
 *           type: string
 *           description: The action allowed on the resource
 *           enum: [read, create, update, delete, manage]
 *           example: read
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *             enum: [admin, doctor, educator, patient]
 *           description: Roles that have this permission (must include at least one)
 *           example: [admin, doctor]
 *           minItems: 1
 *         description:
 *           type: string
 *           description: Human-readable description of the permission
 *           example: View medical records
 *           maxLength: 200
 *
 *     PermissionUpdate:
 *       type: object
 *       properties:
 *         resource:
 *           type: string
 *           description: The resource being protected
 *           example: records
 *         action:
 *           type: string
 *           enum: [read, create, update, delete, manage]
 *           example: update
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *             enum: [admin, doctor, educator, patient]
 *           example: [admin, doctor, patient]
 *         description:
 *           type: string
 *           example: Updated description
 *
 *     CacheStats:
 *       type: object
 *       properties:
 *         size:
 *           type: integer
 *           description: Number of entries in the cache
 *           example: 150
 *         permissionsCount:
 *           type: integer
 *           description: Number of unique permissions cached
 *           example: 25
 *         hits:
 *           type: integer
 *           description: Number of cache hits
 *           example: 1500
 *         misses:
 *           type: integer
 *           description: Number of cache misses
 *           example: 50
 *         hitRate:
 *           type: string
 *           description: Cache hit rate percentage
 *           example: 96.77%
 *         lastRefresh:
 *           type: string
 *           format: date-time
 *           description: Last time cache was refreshed
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 * tags:
 *   - name: Permissions
 *     description: RBAC permission management endpoints (Admin only)
 */

/**
 * @swagger
 * /api/permissions:
 *   get:
 *     summary: Get all permissions
 *     description: Retrieve all permissions with optional filtering by resource, action, or role. Admin access required.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource name
 *         example: records
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [read, create, update, delete, manage]
 *         description: Filter by action type
 *         example: read
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, doctor, educator, patient]
 *         description: Filter by role
 *         example: doctor
 *     responses:
 *       200:
 *         description: List of permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 10
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Permission'
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 *
 *   post:
 *     summary: Create a new permission
 *     description: Create a new permission with resource, action, and roles. Admin access required.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PermissionInput'
 *           examples:
 *             recordsRead:
 *               summary: Records read permission
 *               value:
 *                 resource: records
 *                 action: read
 *                 roles: [admin, doctor, patient]
 *                 description: View medical records
 *             usersManage:
 *               summary: Users manage permission
 *               value:
 *                 resource: users
 *                 action: manage
 *                 roles: [admin]
 *                 description: Full user management
 *     responses:
 *       201:
 *         description: Permission created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Permission created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Permission'
 *       400:
 *         description: Validation error
 *       409:
 *         description: Permission already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/permissions/{id}:
 *   get:
 *     summary: Get permission by ID
 *     description: Retrieve a specific permission by its ID. Admin access required.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Permission ID (MongoDB ObjectId)
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Permission retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Permission'
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Permission not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 *
 *   put:
 *     summary: Update a permission
 *     description: Update an existing permission. Admin access required.
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
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PermissionUpdate'
 *           examples:
 *             addRole:
 *               summary: Add role to permission
 *               value:
 *                 roles: [admin, doctor, patient]
 *             updateDescription:
 *               summary: Update description
 *               value:
 *                 description: Updated permission description
 *     responses:
 *       200:
 *         description: Permission updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Permission updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Permission'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Permission not found
 *       409:
 *         description: Permission conflict (duplicate resource:action)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 *
 *   delete:
 *     summary: Delete a permission
 *     description: Delete an existing permission. Admin access required.
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
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Permission deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Permission deleted successfully
 *                 deletedPermission:
 *                   type: object
 *                   properties:
 *                     resource:
 *                       type: string
 *                       example: records
 *                     action:
 *                       type: string
 *                       example: delete
 *       400:
 *         description: Invalid ID format
 *       404:
 *         description: Permission not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/permissions/role/{role}:
 *   get:
 *     summary: Get permissions by role
 *     description: Retrieve all permissions assigned to a specific role. Admin access required.
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
 *         example: doctor
 *     responses:
 *       200:
 *         description: Role permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 role:
 *                   type: string
 *                   example: doctor
 *                 count:
 *                   type: integer
 *                   example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Permission'
 *       400:
 *         description: Invalid role
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/permissions/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Retrieve permission cache statistics including hit rate and cache size. Admin access required.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CacheStats'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/permissions/cache/refresh:
 *   post:
 *     summary: Refresh permission cache
 *     description: Manually refresh the permission cache from database. Admin access required.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Permission cache refreshed successfully
 *                 stats:
 *                   $ref: '#/components/schemas/CacheStats'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

export default {};
