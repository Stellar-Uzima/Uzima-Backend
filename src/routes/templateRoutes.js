/**
 * Template Routes
 *
 * API routes for email template preview and management.
 */

import express from 'express';
import {
  listTemplates,
  getTemplateDocumentation,
  previewTemplate,
  renderTemplate,
  clearCache,
  templateGallery,
} from '../controllers/templateController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Templates
 *   description: Email template management and preview
 */

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: List all available email templates
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: List of available templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       hasDocumentation:
 *                         type: boolean
 */
router.get('/', listTemplates);

/**
 * @swagger
 * /api/templates/gallery:
 *   get:
 *     summary: View template gallery (HTML page)
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: HTML gallery page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/gallery', templateGallery);

/**
 * @swagger
 * /api/templates/cache/clear:
 *   post:
 *     summary: Clear template cache
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 */
router.post('/cache/clear', clearCache);

/**
 * @swagger
 * /api/templates/{templateName}/docs:
 *   get:
 *     summary: Get template documentation
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: templateName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the template
 *     responses:
 *       200:
 *         description: Template documentation
 *       404:
 *         description: Template not found
 */
router.get('/:templateName/docs', getTemplateDocumentation);

/**
 * @swagger
 * /api/templates/{templateName}/preview:
 *   get:
 *     summary: Preview template with sample data
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: templateName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the template
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [html, text, json]
 *         description: Output format (default html)
 *     responses:
 *       200:
 *         description: Rendered template preview
 *       404:
 *         description: Template not found
 *   post:
 *     summary: Preview template with custom data
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: templateName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Custom data to render in template
 *     responses:
 *       200:
 *         description: Rendered template with custom data
 */
router.get('/:templateName/preview', previewTemplate);
router.post('/:templateName/preview', previewTemplate);

/**
 * @swagger
 * /api/templates/{templateName}/render:
 *   post:
 *     summary: Render template with provided data
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: templateName
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
 *               data:
 *                 type: object
 *                 description: Template variables
 *               options:
 *                 type: object
 *                 properties:
 *                   inlineStyles:
 *                     type: boolean
 *                     default: true
 *                   minify:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Rendered HTML and plain text
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Template not found
 */
router.post('/:templateName/render', renderTemplate);

export default router;
