import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import ApiResponse from '../utils/apiResponse.js';

/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: Multi-tenant management endpoints
 */

const tenantController = {
  /**
   * @swagger
   * /api/admin/tenants:
   *   get:
   *     summary: Get all tenants
   *     description: Retrieve a list of all tenants (admin only)
   *     tags: [Tenants]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, suspended, inactive]
   *         description: Filter by tenant status
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
   *         description: List of tenants retrieved successfully
   *       403:
   *         description: Forbidden - Admin access required
   */
  getAllTenants: async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const query = {};

      if (status) query.status = status;

      const tenants = await Tenant.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const total = await Tenant.countDocuments(query);

      return ApiResponse.success(
        res,
        {
          tenants,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit),
          },
        },
        'Tenants retrieved successfully'
      );
    } catch (error) {
      console.error('Error retrieving tenants:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * @swagger
   * /api/admin/tenants/{id}:
   *   get:
   *     summary: Get tenant by ID
   *     description: Retrieve details of a specific tenant (admin only)
   *     tags: [Tenants]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Tenant ID
   *     responses:
   *       200:
   *         description: Tenant retrieved successfully
   *       404:
   *         description: Tenant not found
   */
  getTenantById: async (req, res) => {
    try {
      const { id } = req.params;
      const tenant = await Tenant.findById(id);

      if (!tenant) {
        return ApiResponse.error(res, 'Tenant not found', 404);
      }

      // Get user count for this tenant
      const userCount = await User.countDocuments({ tenantId: id });

      return ApiResponse.success(res, { tenant, userCount }, 'Tenant retrieved successfully');
    } catch (error) {
      console.error('Error retrieving tenant:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * @swagger
   * /api/admin/tenants:
   *   post:
   *     summary: Create a new tenant
   *     description: Create a new tenant organization (admin only)
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
   *                 example: "Acme Healthcare"
   *               slug:
   *                 type: string
   *                 example: "acme-healthcare"
   *               description:
   *                 type: string
   *               settings:
   *                 type: object
   *     responses:
   *       201:
   *         description: Tenant created successfully
   *       400:
   *         description: Validation error
   */
  createTenant: async (req, res) => {
    try {
      const { name, slug, description, settings } = req.body;

      // Validate required fields
      if (!name || !slug) {
        return ApiResponse.error(res, 'Name and slug are required', 400);
      }

      // Check if slug is unique
      const existingTenant = await Tenant.findOne({ slug: slug.toLowerCase() });
      if (existingTenant) {
        return ApiResponse.error(res, 'Tenant slug already exists', 400);
      }

      const tenant = new Tenant({
        name,
        slug: slug.toLowerCase(),
        description,
        settings,
        status: 'active',
      });

      await tenant.save();

      return ApiResponse.success(res, { tenant }, 'Tenant created successfully', 201);
    } catch (error) {
      console.error('Error creating tenant:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * @swagger
   * /api/admin/tenants/{id}:
   *   put:
   *     summary: Update a tenant
   *     description: Update tenant details (admin only)
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
   *       required: true
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
   *         description: Tenant updated successfully
   *       404:
   *         description: Tenant not found
   */
  updateTenant: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, status, settings } = req.body;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return ApiResponse.error(res, 'Tenant not found', 404);
      }

      if (name) tenant.name = name;
      if (description) tenant.description = description;
      if (status) tenant.status = status;
      if (settings) tenant.settings = { ...tenant.settings, ...settings };

      await tenant.save();

      return ApiResponse.success(res, { tenant }, 'Tenant updated successfully');
    } catch (error) {
      console.error('Error updating tenant:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * @swagger
   * /api/admin/tenants/{id}:
   *   delete:
   *     summary: Delete a tenant
   *     description: Soft delete a tenant (admin only)
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
   *         description: Tenant deleted successfully
   *       404:
   *         description: Tenant not found
   */
  deleteTenant: async (req, res) => {
    try {
      const { id } = req.params;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return ApiResponse.error(res, 'Tenant not found', 404);
      }

      // Instead of hard delete, set status to inactive
      tenant.status = 'inactive';
      await tenant.save();

      return ApiResponse.success(res, null, 'Tenant deactivated successfully');
    } catch (error) {
      console.error('Error deleting tenant:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * @swagger
   * /api/admin/tenants/{id}/users:
   *   get:
   *     summary: Get users for a tenant
   *     description: Retrieve all users belonging to a specific tenant (admin only)
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
   *         description: Users retrieved successfully
   *       404:
   *         description: Tenant not found
   */
  getTenantUsers: async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return ApiResponse.error(res, 'Tenant not found', 404);
      }

      const users = await User.find({ tenantId: id })
        .select('-password -security.twoFactorCode -security.passwordResetToken')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const total = await User.countDocuments({ tenantId: id });

      return ApiResponse.success(
        res,
        {
          users,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit),
          },
        },
        'Users retrieved successfully'
      );
    } catch (error) {
      console.error('Error retrieving tenant users:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  /**
   * @swagger
   * /api/admin/tenants/{id}/stats:
   *   get:
   *     summary: Get tenant statistics
   *     description: Retrieve statistics for a specific tenant (admin only)
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
   *         description: Statistics retrieved successfully
   *       404:
   *         description: Tenant not found
   */
  getTenantStats: async (req, res) => {
    try {
      const { id } = req.params;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return ApiResponse.error(res, 'Tenant not found', 404);
      }

      // Get user statistics
      const totalUsers = await User.countDocuments({ tenantId: id });
      const usersByRole = await User.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(id) } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]);

      return ApiResponse.success(
        res,
        {
          tenant: {
            id: tenant._id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
          },
          stats: {
            totalUsers,
            usersByRole: usersByRole.reduce((acc, curr) => {
              acc[curr._id] = curr.count;
              return acc;
            }, {}),
          },
        },
        'Tenant statistics retrieved successfully'
      );
    } catch (error) {
      console.error('Error retrieving tenant stats:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },
};

export default tenantController;
