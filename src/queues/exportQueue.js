import { Queue, Worker } from 'bullmq';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queueName = 'export-queue';

function parseRedisUrl(urlString) {
  const u = new URL(urlString || 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0,
  };
}

const connection = parseRedisUrl(process.env.REDIS_URL);
const exportQueue = new Queue(queueName, { connection });

// Ensure exports directory exists
const exportsDir = path.join(__dirname, '../../exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Worker to process export jobs
const exportWorker = new Worker(queueName, async (job) => {
  const { exportType, filters, format, userId } = job.data;

  try {
    // Update progress to 10%
    await job.updateProgress(10);

    // Simulate data fetching (replace with actual data fetching logic)
    let data = [];
    if (exportType === 'records') {
      // Import Record model dynamically to avoid circular dependencies
      const { default: Record } = await import('../models/Record.js');
      data = await Record.find(filters || {}).limit(10000); // Limit for demo
    } else if (exportType === 'users') {
      const { default: User } = await import('../models/User.js');
      data = await User.find(filters || {}).limit(10000);
    } else if (exportType === 'prescriptions') {
      const { default: Prescription } = await import('../models/Prescription.js');
      data = await Prescription.find(filters || {}).limit(10000);
    }

    // Update progress to 50%
    await job.updateProgress(50);

    // Generate file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `export_${exportType}_${timestamp}.${format}`;
    const filePath = path.join(exportsDir, filename);

    if (format === 'json') {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } else if (format === 'csv') {
      // Simple CSV generation (for demo)
      const csvData = data.map(item => JSON.stringify(item)).join('\n');
      fs.writeFileSync(filePath, csvData);
    }

    // Update progress to 100%
    await job.updateProgress(100);

    // Store file info in job data
    job.data.filePath = filePath;
    job.data.filename = filename;

    return { success: true, filePath, filename };

  } catch (error) {
    console.error('Export job failed:', error);
    throw error;
  }
}, { connection });

export async function enqueueExport(data) {
  return exportQueue.add('process-export', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 10, // Keep last 10 failed jobs
  });
}

export async function getJobStatus(jobId) {
  const job = await exportQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress;

  return {
    jobId,
    state,
    progress,
    data: job.data,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    failedReason: job.failedReason,
  };
}

export async function getQueueStats() {
  const counts = await exportQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

export default {
  add: enqueueExport,
  getJobStatus,
  getStats: getQueueStats,
  queue: exportQueue,
};