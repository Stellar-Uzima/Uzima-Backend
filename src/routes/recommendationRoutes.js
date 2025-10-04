// Routes for recommendations
const express = require('express');
const router = express.Router();
const recommendationController = require('../../controllers/recommendationController');
const authMiddleware = require('../middleware/authMiddleware');

// Get recommendations (paginated)
router.get('/', authMiddleware, recommendationController.getRecommendations);

// Set opt-out
router.post('/optout', authMiddleware, recommendationController.setOptOut);

// Log A/B test click
router.post('/abtest/click', authMiddleware, recommendationController.logAbTestClick);

module.exports = router;
