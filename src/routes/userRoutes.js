import express from 'express';
import userController from '../controllers/userController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { cacheGet } from '../middleware/cache.js';
import { userListKey, userByIdKey } from '../utils/cacheKeys.js';
import { getCreditScoreCached } from '../services/creditScoreService.js';

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
router.get('/', hasPermission('view_users'), cacheGet((req) => userListKey({ includeDeleted: req.query.includeDeleted === 'true', page: req.query.page || 1, limit: req.query.limit || 20 }), 120), userController.getAllUsers);

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
router.get('/:id', hasPermission('view_own_record'), cacheGet((req) => userByIdKey(req.params.id), 300), userController.getUserById);

export default router;

// Credit score route example (cached)
router.get('/:id/credit-score', hasPermission('view_own_record'), async (req, res) => {
  const data = await getCreditScoreCached(req.params.id);
  res.json({ success: true, data });
});
