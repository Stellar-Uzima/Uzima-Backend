import express from 'express';
import emailQueueModule from '../queues/emailQueue.js';

const router = express.Router();

/**
 * @swagger
 * /api/jobs/status/{jobId}:
 *   get:
 *     summary: Get the status of a specific job
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
 *       404:
 *         description: Job not found
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await emailQueueModule.queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress;
    const reason = job.failedReason;

    res.json({
      id: job.id,
      name: job.name,
      state,
      progress,
      failedReason: reason,
      data: job.data,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * @swagger
 * /api/jobs/stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Queue statistics retrieved successfully
 */
router.get('/stats', async (req, res) => {
  try {
    const counts = await emailQueueModule.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed'
    );
    res.json({
      emailQueue: {
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
        delayed: counts.delayed,
      },
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
});

export default router;
