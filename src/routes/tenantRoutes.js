import express from 'express';
import tenantController from '../controllers/tenantController.js';
import { auth } from '../middleware/authMiddleware.js';
import requireRoles from '../middleware/requireRole.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: Multi-tenant management endpoints (Admin only)
 */

// All routes require authentication and admin role
router.use(auth);
router.use(requireRoles(['admin']));

/**
 * @swagger
 * /api/admin/tenants:
 *   get:
 *     summary: Get all tenants
 *     description: Retrieve a list of all tenants with pagination
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, inactive]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of tenants
 */
router.get('/', tenantController.getAllTenants);

/**
 * @swagger
 * /api/admin/tenants:
 *   post:
 *     summary: Create a new tenant
 *     description: Create a new tenant organization
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               settings:
 *                 type: object
 *     responses:
 *       201:
 *         description: Tenant created
 */
router.post('/', tenantController.createTenant);

/**
 * @swagger
 * /api/admin/tenants/{id}:
 *   get:
 *     summary: Get tenant by ID
 *     description: Retrieve tenant details including user count
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant details
 *       404:
 *         description: Tenant not found
 */
router.get('/:id', tenantController.getTenantById);

/**
 * @swagger
 * /api/admin/tenants/{id}:
 *   put:
 *     summary: Update a tenant
 *     description: Update tenant details
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, suspended, inactive]
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tenant updated
 */
router.put('/:id', tenantController.updateTenant);

/**
 * @swagger
 * /api/admin/tenants/{id}:
 *   delete:
 *     summary: Delete a tenant
 *     description: Deactivate a tenant (soft delete)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant deactivated
 */
router.delete('/:id', tenantController.deleteTenant);

/**
 * @swagger
 * /api/admin/tenants/{id}/users:
 *   get:
 *     summary: Get tenant users
 *     description: Retrieve all users belonging to a tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/:id/users', tenantController.getTenantUsers);

/**
 * @swagger
 * /api/admin/tenants/{id}/stats:
 *   get:
 *     summary: Get tenant statistics
 *     description: Retrieve statistics for a tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant statistics
 */
router.get('/:id/stats', tenantController.getTenantStats);

export default router;
