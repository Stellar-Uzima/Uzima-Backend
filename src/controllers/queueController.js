// src/controllers/queueController.js
const { getQueues, getQueue } = require('../queues');

// GET /queues/stats
const getQueueStats = async (req, res) => {
  try {
    const queues = getQueues();
    const stats = await Promise.all(
      Object.entries(queues).map(async ([name, queue]) => {
        const [jobCounts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()]);
        return {
          name,
          isPaused,
          counts: {
            waiting: jobCounts.waiting,
            active: jobCounts.active,
            completed: jobCounts.completed,
            failed: jobCounts.failed,
            delayed: jobCounts.delayed,
            total:
              jobCounts.waiting +
              jobCounts.active +
              jobCounts.completed +
              jobCounts.failed +
              jobCounts.delayed,
          },
        };
      })
    );
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /queues/:name/jobs
const getQueueJobs = async (req, res) => {
  try {
    const { name } = req.params;
    const { status = 'waiting', start = 0, end = 49 } = req.query;

    const queue = getQueue(name);
    if (!queue) {
      return res.status(404).json({ success: false, message: `Queue "${name}" not found` });
    }

    const validStatuses = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Use one of: ${validStatuses.join(', ')}`,
      });
    }

    const jobs = await queue.getJobs([status], Number(start), Number(end));
    const jobData = jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      status,
      progress: job._progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      processingTime: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    }));

    return res.status(200).json({ success: true, count: jobData.length, data: jobData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /queues/:name/failed
const getFailedJobs = async (req, res) => {
  try {
    const { name } = req.params;
    const { start = 0, end = 49 } = req.query;

    const queue = getQueue(name);
    if (!queue) {
      return res.status(404).json({ success: false, message: `Queue "${name}" not found` });
    }

    const jobs = await queue.getFailed(Number(start), Number(end));
    const jobData = jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));

    return res.status(200).json({ success: true, count: jobData.length, data: jobData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /queues/:name/jobs/:id/retry
const retryJob = async (req, res) => {
  try {
    const { name, id } = req.params;

    const queue = getQueue(name);
    if (!queue) {
      return res.status(404).json({ success: false, message: `Queue "${name}" not found` });
    }

    const job = await queue.getJob(id);
    if (!job) {
      return res
        .status(404)
        .json({ success: false, message: `Job "${id}" not found in queue "${name}"` });
    }

    await job.retry();
    return res
      .status(200)
      .json({ success: true, message: `Job "${id}" has been queued for retry` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /queues/:name/jobs/:id/remove
const removeJob = async (req, res) => {
  try {
    const { name, id } = req.params;

    const queue = getQueue(name);
    if (!queue) {
      return res.status(404).json({ success: false, message: `Queue "${name}" not found` });
    }

    const job = await queue.getJob(id);
    if (!job) {
      return res
        .status(404)
        .json({ success: false, message: `Job "${id}" not found in queue "${name}"` });
    }

    await job.remove();
    return res
      .status(200)
      .json({ success: true, message: `Job "${id}" has been removed from queue "${name}"` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getQueueStats, getQueueJobs, getFailedJobs, retryJob, removeJob };
