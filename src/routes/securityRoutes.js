import express from 'express';
import securityController from '../controllers/securityController.js';
import protect from '../middleware/authMiddleware.js';
import { activityLogger } from '../middleware/activityLogger.js';

const router = express.Router();

// All security routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/security/devices:
 *   get:
 *     summary: Get all devices for authenticated user
 *     description: List all devices (browsers/apps) that have been used to access the account
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: Number of devices to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by active devices only
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: "-lastSeenAt"
 *         description: Sort field and direction
 *     responses:
 *       200:
 *         description: Devices retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/devices',
  activityLogger({ action: 'view_devices' }),
  securityController.getDevices
);

/**
 * @swagger
 * /api/security/devices/{deviceId}:
 *   get:
 *     summary: Get device details
 *     description: Get detailed information about a specific device
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     responses:
 *       200:
 *         description: Device details retrieved
 *       404:
 *         description: Device not found
 */
router.get(
  '/devices/:deviceId',
  activityLogger({ action: 'view_device_details' }),
  securityController.getDeviceDetails
);

/**
 * @swagger
 * /api/security/devices/{deviceId}/trust:
 *   put:
 *     summary: Trust or untrust a device
 *     description: Mark a device as trusted to reduce security alerts
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trusted:
 *                 type: boolean
 *                 default: true
 *                 description: Trust status
 *     responses:
 *       200:
 *         description: Device trust status updated
 *       404:
 *         description: Device not found
 */
router.put(
  '/devices/:deviceId/trust',
  activityLogger({ action: 'trust_device' }),
  securityController.trustDevice
);

/**
 * @swagger
 * /api/security/devices/{deviceId}:
 *   delete:
 *     summary: Remove a device
 *     description: Mark a device as inactive (future logins will treat it as new)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     responses:
 *       200:
 *         description: Device removed successfully
 *       404:
 *         description: Device not found
 */
router.delete(
  '/devices/:deviceId',
  activityLogger({ action: 'remove_device' }),
  securityController.removeDevice
);

/**
 * @swagger
 * /api/security/activity:
 *   get:
 *     summary: Get login activity history
 *     description: View all login attempts with locations and fraud flags
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Number of activity records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *       - in: query
 *         name: flaggedOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Show only suspicious logins
 *     responses:
 *       200:
 *         description: Activity retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/activity',
  activityLogger({ action: 'view_security_activity' }),
  securityController.getActivity
);

/**
 * @swagger
 * /api/security/summary:
 *   get:
 *     summary: Get security summary
 *     description: Get overview of security metrics and patterns
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Security summary retrieved
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/summary',
  activityLogger({ action: 'view_security_summary' }),
  securityController.getSummary
);

/**
 * @swagger
 * /api/security/fraud-report:
 *   get:
 *     summary: Get fraud detection report
 *     description: Generate detailed fraud detection report for user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Fraud report generated
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/fraud-report',
  activityLogger({ action: 'view_fraud_report' }),
  securityController.getFraudReport
);

export default router;
