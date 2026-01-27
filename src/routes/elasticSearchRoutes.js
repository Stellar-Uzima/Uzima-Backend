import express from 'express';
import {
  searchMedicalRecords,
  reindexAllRecords,
  getIndexStats,
} from '../controllers/elasticSearchController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { cacheMiddleware } from '../middleware/cache.js';
import { activityLogger } from '../middleware/activityLogger.js';

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Elasticsearch-powered medical record search
 */

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search medical records
 *     description: Full-text search across medical records with fuzzy matching, faceted filters, and highlighting
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 200
 *         description: Search query (max 200 characters)
 *         example: diabetes
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Results per page (max 100)
 *         example: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [_score, createdAt]
 *           default: _score
 *         description: Sort field
 *         example: _score
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *         example: desc
 *       - in: query
 *         name: filters
 *         schema:
 *           type: string
 *         description: JSON string of facet filters (e.g., {"diagnosis":"diabetes","dateFrom":"2026-01-01"})
 *         example: '{"diagnosis":"diabetes"}'
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     query:
 *                       type: string
 *                       example: diabetes
 *                     took:
 *                       type: integer
 *                       description: Search time in milliseconds
 *                       example: 45
 *                     total:
 *                       type: integer
 *                       description: Total matching documents
 *                       example: 156
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     pages:
 *                       type: integer
 *                       description: Total pages
 *                       example: 16
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           _score:
 *                             type: number
 *                           diagnosis:
 *                             type: string
 *                           treatment:
 *                             type: string
 *                           notes:
 *                             type: string
 *                           patientName:
 *                             type: string
 *                           patientEmail:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           highlight:
 *                             type: object
 *                             description: Highlighted search matches wrapped in <em> tags
 *                     facets:
 *                       type: object
 *                       properties:
 *                         diagnoses:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               key:
 *                                 type: string
 *                               count:
 *                                 type: integer
 *                         dates:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               key:
 *                                 type: string
 *                               count:
 *                                 type: integer
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized - User not authenticated
 *       500:
 *         description: Server error
 */
router.get(
  '/',
  cacheMiddleware({
    prefix: 'elastic_search',
    ttl: 60, // 60 seconds cache
    queryParams: ['q', 'page', 'limit', 'sortBy', 'sortOrder', 'filters'],
  }),
  activityLogger({ action: 'search_records' }),
  searchMedicalRecords
);

/**
 * @swagger
 * /api/search/reindex:
 *   post:
 *     summary: Reindex all medical records
 *     description: Bulk reindex all medical records from MongoDB to Elasticsearch (Admin only)
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reindexing completed successfully
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
 *                   example: Reindexing completed
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total records processed
 *                       example: 1000
 *                     indexed:
 *                       type: integer
 *                       description: Successfully indexed records
 *                       example: 998
 *                     errors:
 *                       type: integer
 *                       description: Number of errors
 *                       example: 2
 *                     duration:
 *                       type: integer
 *                       description: Reindex duration in milliseconds
 *                       example: 5432
 *                     errorDetails:
 *                       type: array
 *                       description: First 10 errors (if any)
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */
router.post(
  '/reindex',
  hasPermission('admin', 'manage'),
  activityLogger({ action: 'reindex_elasticsearch' }),
  reindexAllRecords
);

/**
 * @swagger
 * /api/search/stats:
 *   get:
 *     summary: Get Elasticsearch index statistics
 *     description: Retrieve health and statistics about the Elasticsearch index (Admin only)
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Index statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     indexName:
 *                       type: string
 *                       example: medical_records
 *                     health:
 *                       type: string
 *                       enum: [green, yellow, red]
 *                       example: green
 *                     documentCount:
 *                       type: integer
 *                       example: 1000
 *                     indexSize:
 *                       type: integer
 *                       description: Index size in bytes
 *                       example: 1048576
 *                     indexSizeHuman:
 *                       type: string
 *                       example: 1 MB
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Index does not exist
 *       500:
 *         description: Server error
 */
router.get(
  '/stats',
  hasPermission('admin', 'manage'),
  activityLogger({ action: 'view_search_stats' }),
  getIndexStats
);

export default router;
