import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateUserRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - firstName
 *         - lastName
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: john.doe@example.com
 *           description: User email address
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           maxLength: 50
 *           example: SecureP@ssw0rd
 *           description: User password (min 8 chars, must contain uppercase, lowercase, and number)
 *         firstName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           example: John
 *           description: User first name
 *         lastName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           example: Doe
 *           description: User last name
 *         role:
 *           type: string
 *           enum: [admin, user, moderator]
 *           default: user
 *           example: user
 *           description: User role
 *     
 *     UpdateUserRequest:
 *       type: object
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: john.doe@example.com
 *         firstName:
 *           type: string
 *           example: John
 *         lastName:
 *           type: string
 *           example: Doe
 *         role:
 *           type: string
 *           enum: [admin, user, moderator]
 *     
 *     UserResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 123e4567-e89b-12d3-a456-426614174000
 *           description: User unique identifier
 *         email:
 *           type: string
 *           example: john.doe@example.com
 *         firstName:
 *           type: string
 *           example: John
 *         lastName:
 *           type: string
 *           example: Doe
 *         role:
 *           type: string
 *           enum: [admin, user, moderator]
 *           example: user
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: 2024-01-15T10:30:00Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: 2024-01-20T15:45:00Z
 *     
 *     PaginatedUsersResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UserResponse'
 *         total:
 *           type: integer
 *           example: 100
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 10
 *         totalPages:
 *           type: integer
 *           example: 10
 */

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags:
 *       - Users
 *     summary: Create a new user
 *     description: Creates a new user account with the provided information
 *     operationId: createUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User successfully created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User with this email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8, max: 50 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    body('firstName').trim().isLength({ min: 2, max: 50 }),
    body('lastName').trim().isLength({ min: 2, max: 50 }),
    body('role').optional().isIn(['admin', 'user', 'moderator']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Validation failed',
        errors: errors.array().map(err => err.msg),
      });
    }

    try {
      // Your user creation logic here
      const user = await createUser(req.body);
      res.status(201).json(user);
    } catch (error: any) {
      res.status(error.status || 500).json({
        statusCode: error.status || 500,
        message: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get all users
 *     description: Retrieves a paginated list of users. Requires authentication.
 *     operationId: getAllUsers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (default 1)
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Items per page (default 10, max 100)
 *         example: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search users by name or email
 *         example: john
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedUsersResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/',
  authMiddleware,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
  ],
  async (req, res) => {
    try {
      const { page = 1, limit = 10, search } = req.query;
      const users = await getAllUsers({ page, limit, search });
      res.json(users);
    } catch (error: any) {
      res.status(error.status || 500).json({
        statusCode: error.status || 500,
        message: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get user by ID
 *     description: Retrieves detailed information about a specific user
 *     operationId: getUserById
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User unique identifier
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', authMiddleware, param('id').isUUID(), async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: 'User not found',
      });
    }
    res.json(user);
  } catch (error: any) {
    res.status(error.status || 500).json({
      statusCode: error.status || 500,
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     tags:
 *       - Users
 *     summary: Update user
 *     description: Updates user information
 *     operationId: updateUser
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserRequest'
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       404:
 *         description: User not found
 *       400:
 *         description: Invalid input
 */
router.put(
  '/:id',
  authMiddleware,
  [
    param('id').isUUID(),
    body('email').optional().isEmail().normalizeEmail(),
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
  ],
  async (req, res) => {
    try {
      const user = await updateUser(req.params.id, req.body);
      res.json(user);
    } catch (error: any) {
      res.status(error.status || 500).json({
        statusCode: error.status || 500,
        message: error.message,
      });
    }
  }
);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete user
 *     description: Permanently deletes a user account
 *     operationId: deleteUser
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       204:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', authMiddleware, param('id').isUUID(), async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(error.status || 500).json({
      statusCode: error.status || 500,
      message: error.message,
    });
  }
});

// Placeholder functions (implement your actual logic)
async function createUser(data: any) {
  return { id: '123', ...data };
}
async function getAllUsers(params: any) {
  return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
}
async function getUserById(id: string) {
  return null;
}
async function updateUser(id: string, data: any) {
  return { id, ...data };
}
async function deleteUser(id: string) {}

export default router;