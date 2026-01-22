// Routes for articles engagement metrics
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/articleEngagementController');
const authMiddleware = require('../middleware/authMiddleware');

// Update engagement metrics (views, likes, shares)
router.patch('/:id/engagement', authMiddleware, controller.updateEngagement);

module.exports = router;
