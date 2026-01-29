import express from 'express';
import {
  getUserActivityLogs,
  getAllActivityLogs,
  getUserActivitySummary,
  getActivityStatistics,
  getActivityTrends,
  getTopActions,
  getSuspiciousActivity,
  exportActivityLogs,
  logActivity,
} from '../controllers/activityLogController.js';
import { auth } from '../middleware/authMiddleware.js';
import requireRoles from '../middleware/requireRole.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ActivityLog:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the activity log
 *         userId:
 *           type: string
 *           description: ID of the user who performed the action
 *         action:
 *           type: string
 *           description: Type of action performed
 *           enum: [login, logout, create, read, update, delete, upload, download, export, import, approve, reject, submit, cancel, verify, authenticate, authorize, password_change, profile_update, settings_change, data_export, data_import, backup_create, backup_restore, system_access, api_access, webhook_trigger, payment_process, contract_sign, record_access, gdpr_request, admin_action, security_event, error_occurred, other]
 *         metadata:
 *           type: object
 *           description: Additional context data for the action
 *         ipAddress:
 *           type: string
 *           description: IP address from which the action was performed
 *         userAgent:
 *           type: string
 *           description: User agent string of the client
 *         resourceType:
 *           type: string
 *           description: Type of resource affected by the action
 *         resourceId:
 *           type: string
 *           description: ID of the specific resource affected
 *         result:
 *           type: string
 *           enum: [success, failure, pending]
 *           description: Result of the action
 *         errorMessage:
 *           type: string
 *           description: Error message if the action failed
 *         sessionId:
 *           type: string
 *           description: Session ID when the action was performed
 *         requestId:
 *           type: string
 *           description: Unique request identifier
 *         duration:
 *           type: number
 *           description: Duration of the action in milliseconds
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: When the action was performed
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: When this log entry will be automatically deleted
 *       required:
 *         - userId
 *         - action
 *         - timestamp
 *     ActivityLogResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             logs:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ActivityLog'
 *             pagination:
 *               type: object
 *               properties:
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalCount:
 *                   type: integer
 *                 hasNextPage:
 *                   type: boolean
 *                 hasPrevPage:
 *                   type: boolean
 */

/**
 * @swagger
 * /activity/{userId}:
 *   get:
 *     summary: Get activity logs for a specific user
 *     description: Retrieve paginated activity logs for a user. Users can only view their own logs unless they have admin privileges.
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get activity logs for
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of logs per page (max 100)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type (comma-separated for multiple)
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [success, failure, pending]
 *         description: Filter by action result
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: timestamp
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Activity logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ActivityLogResponse'
 *       400:
 *         description: Invalid user ID format
 *       403:
 *         description: Access denied - can only view own logs
 *       500:
 *         description: Server error
 */
router.get('/:userId', auth, getUserActivityLogs);

/**
 * @swagger
 * /activity/{userId}/summary:
 *   get:
 *     summary: Get activity summary for a user
 *     description: Get aggregated activity statistics for a user over a specified time period.
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get activity summary for
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to include in summary
 *     responses:
 *       200:
 *         description: Activity summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     days:
 *                       type: integer
 *                     summary:
 *                       type: array
 *                       items:
 *                         type: object
 *       403:
 *         description: Access denied - can only view own summary
 *       500:
 *         description: Server error
 */
router.get('/:userId/summary', auth, getUserActivitySummary);

// Admin routes - require admin or super_admin role
/**
 * @swagger
 * /admin/activity:
 *   get:
 *     summary: Get all activity logs (Admin only)
 *     description: Retrieve paginated activity logs for all users with advanced filtering options.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of logs per page (max 100)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID (comma-separated for multiple)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type (comma-separated for multiple)
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [success, failure, pending]
 *         description: Filter by action result
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: ipAddress
 *         schema:
 *           type: string
 *         description: Filter by IP address
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: timestamp
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Activity logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ActivityLogResponse'
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.get('/admin/activity', auth, requireRoles('admin', 'super_admin'), getAllActivityLogs);

/**
 * @swagger
 * /admin/activity/statistics:
 *   get:
 *     summary: Get activity statistics (Admin only)
 *     description: Get system-wide activity statistics with optional filtering.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter statistics from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter statistics until this date
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [success, failure, pending]
 *         description: Filter by action result
 *     responses:
 *       200:
 *         description: Activity statistics retrieved successfully
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.get(
  '/admin/activity/statistics',
  auth,
  requireRoles('admin', 'super_admin'),
  getActivityStatistics
);

/**
 * @swagger
 * /admin/activity/trends:
 *   get:
 *     summary: Get activity trends (Admin only)
 *     description: Get activity trends over time with configurable grouping.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for trend analysis
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for trend analysis
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Time grouping for trends
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Activity trends retrieved successfully
 *       400:
 *         description: Invalid groupBy parameter
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.get('/admin/activity/trends', auth, requireRoles('admin', 'super_admin'), getActivityTrends);

/**
 * @swagger
 * /admin/activity/top-actions:
 *   get:
 *     summary: Get top actions by frequency (Admin only)
 *     description: Get the most frequently performed actions with statistics.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: Number of top actions to return (max 50)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter until this date
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Top actions retrieved successfully
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.get(
  '/admin/activity/top-actions',
  auth,
  requireRoles('admin', 'super_admin'),
  cacheMiddleware({
    prefix: 'activity:top-actions',
    ttl: 600, // 10 minutes
    queryParams: ['limit', 'startDate', 'endDate', 'userId'],
  }),
  getTopActions
);

/**
 * @swagger
 * /admin/activity/suspicious:
 *   get:
 *     summary: Get suspicious activity patterns (Admin only)
 *     description: Detect and retrieve suspicious activity patterns based on failure rates.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeWindow
 *         schema:
 *           type: integer
 *           default: 60
 *         description: Time window in minutes for analysis
 *       - in: query
 *         name: failureThreshold
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Minimum number of failures to be considered suspicious
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for analysis (defaults to 24 hours ago)
 *     responses:
 *       200:
 *         description: Suspicious activity retrieved successfully
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.get(
  '/admin/activity/suspicious',
  auth,
  requireRoles('admin', 'super_admin'),
  getSuspiciousActivity
);

/**
 * @swagger
 * /admin/activity/export:
 *   get:
 *     summary: Export activity logs to CSV (Admin only)
 *     description: Export filtered activity logs as a CSV file.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID (comma-separated for multiple)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type (comma-separated for multiple)
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [success, failure, pending]
 *         description: Filter by action result
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs until this date
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: ipAddress
 *         schema:
 *           type: string
 *         description: Filter by IP address
 *     responses:
 *       200:
 *         description: CSV file with activity logs
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.get(
  '/admin/activity/export',
  auth,
  requireRoles('admin', 'super_admin'),
  exportActivityLogs
);

/**
 * @swagger
 * /admin/activity:
 *   post:
 *     summary: Manually log an activity (Admin only)
 *     description: Manually create an activity log entry.
 *     tags: [Activity Logs - Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - action
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user who performed the action
 *               action:
 *                 type: string
 *                 description: Type of action performed
 *               metadata:
 *                 type: object
 *                 description: Additional context data
 *               resourceType:
 *                 type: string
 *                 description: Type of resource affected
 *               resourceId:
 *                 type: string
 *                 description: ID of the resource affected
 *               result:
 *                 type: string
 *                 enum: [success, failure, pending]
 *                 default: success
 *                 description: Result of the action
 *               errorMessage:
 *                 type: string
 *                 description: Error message if action failed
 *     responses:
 *       201:
 *         description: Activity logged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ActivityLog'
 *       400:
 *         description: Invalid request data
 *       403:
 *         description: Access denied - admin role required
 *       500:
 *         description: Server error
 */
router.post('/admin/activity', auth, requireRoles('admin', 'super_admin'), logActivity);

export default router;
