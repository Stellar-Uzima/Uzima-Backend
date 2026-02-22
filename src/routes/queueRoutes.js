// src/routes/queueRoutes.js
const express = require('express');
const router = express.Router();
const {
  getQueueStats,
  getQueueJobs,
  getFailedJobs,
  retryJob,
  removeJob,
} = require('../controllers/queueController');
const adminAuth = require('../middlewares/adminAuth');

// Apply admin protection to all queue routes
router.use(adminAuth);

router.get('/stats', getQueueStats);
router.get('/:name/jobs', getQueueJobs);
router.get('/:name/failed', getFailedJobs);
router.post('/:name/jobs/:id/retry', retryJob);
router.delete('/:name/jobs/:id/remove', removeJob);

module.exports = router;
