import express from 'express';
import preferenceController from '../controllers/preferenceController.js';
import protect from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { activityLogger } from '../middleware/activityLogger.js';
import {
  preferenceUpdateSchema,
  preferenceMergeSchema,
} from '../validations/preferenceValidators.js';

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @swagger
 * /api/users/me/preferences:
 *   get:
 *     summary: Get user preferences
 *     description: Retrieve the current user's preferences
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: object
 *                 ui:
 *                   type: object
 *                 privacy:
 *                   type: object
 *                 accessibility:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get(
  '/',
  activityLogger({ action: 'view_preferences' }),
  preferenceController.getPreferences
);

/**
 * @swagger
 * /api/users/me/preferences:
 *   put:
 *     summary: Merge user preferences
 *     description: Merge new preferences with existing ones (partial update)
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferences:
 *                 type: object
 *                 description: Preference object to merge
 *                 example:
 *                   notifications:
 *                     email: false
 *                   ui:
 *                     theme: "dark"
 *     responses:
 *       200:
 *         description: Preferences merged successfully
 *       400:
 *         description: Invalid preferences
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.put(
  '/',
  validate(preferenceMergeSchema),
  activityLogger({ action: 'update_preferences' }),
  preferenceController.mergePreferences
);

/**
 * @swagger
 * /api/users/me/preferences/update:
 *   put:
 *     summary: Update specific preference
 *     description: Update a specific preference using dot notation
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *               - value
 *             properties:
 *               path:
 *                 type: string
 *                 description: Dot notation path to the preference
 *                 example: "notifications.email"
 *               value:
 *                 type: any
 *                 description: New value for the preference
 *                 example: false
 *     responses:
 *       200:
 *         description: Preference updated successfully
 *       400:
 *         description: Invalid path or value
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.put(
  '/update',
  validate(preferenceUpdateSchema),
  activityLogger({ action: 'update_preference' }),
  preferenceController.updatePreference
);

/**
 * @swagger
 * /api/users/me/preferences/reset:
 *   post:
 *     summary: Reset preferences to defaults
 *     description: Reset all user preferences to their default values
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences reset successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post(
  '/reset',
  activityLogger({ action: 'reset_preferences' }),
  preferenceController.resetPreferences
);

/**
 * @swagger
 * /api/users/me/preferences/history:
 *   get:
 *     summary: Get preference change history
 *     description: Retrieve the history of preference changes for the current user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Preference history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   action:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   details:
 *                     type: string
 *                   metadata:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/history',
  activityLogger({ action: 'view_preference_history' }),
  preferenceController.getPreferenceHistory
);

/**
 * @swagger
 * /api/users/me/preferences/stats:
 *   get:
 *     summary: Get preference statistics
 *     description: Retrieve statistics about preference changes for the current user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 1y]
 *           default: 30d
 *         description: Time range for statistics
 *     responses:
 *       200:
 *         description: Preference statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/stats',
  activityLogger({ action: 'view_preference_stats' }),
  preferenceController.getPreferenceStats
);

/**
 * @swagger
 * /api/users/me/preferences/export:
 *   get:
 *     summary: Export user preferences
 *     description: Export user preferences for backup or migration
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 preferences:
 *                   type: object
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/export',
  activityLogger({ action: 'export_preferences' }),
  preferenceController.exportPreferences
);

/**
 * @swagger
 * /api/users/me/preferences/import:
 *   post:
 *     summary: Import user preferences
 *     description: Import user preferences from backup or migration data
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preferences
 *             properties:
 *               preferences:
 *                 type: object
 *                 description: Preference object to import
 *     responses:
 *       200:
 *         description: Preferences imported successfully
 *       400:
 *         description: Invalid preferences data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post(
  '/import',
  activityLogger({ action: 'import_preferences' }),
  preferenceController.importPreferences
);

export default router;
