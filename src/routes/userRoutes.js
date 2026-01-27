import express from 'express';
import userController from '../controllers/userController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { validate } from '../middleware/validationMiddleware.js';
import { activityLogger } from '../middleware/activityLogger.js';
import { getUserListSchema, getUserByIdSchema } from '../validations/userValidators.js';
import preferenceRoutes from './preferenceRoutes.js';

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 */
router.get(
  '/',
  hasPermission('users', 'read'),
  validate(getUserListSchema),
  activityLogger({ action: 'view_all_users' }),
  userController.getAllUsers
);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a specific user's details by their ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: User not found
 */
router.get(
  '/:id',
  hasPermission('users', 'read'),
  validate(getUserByIdSchema),
  activityLogger({ action: 'view_user_profile' }),
  userController.getUserById
);

// Preference routes for current user (/api/users/me/preferences/*)
router.use('/me/preferences', preferenceRoutes);

export default router;
