import cron from 'node-cron';
import IdempotencyKey from '../models/IdempotencyKey.js';

// The TTL index on IdempotencyKey technically handles this automatically if MongoDB has it enabled,
// but a manual cleanup cron ensures old keys are removed if the TTL index fails or is delayed.
export const startIdempotencyCleanupJob = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await IdempotencyKey.deleteMany({
        expiresAt: { $lt: twentyFourHoursAgo },
      });
      console.log(`[IdempotencyCleanup] Removed ${result.deletedCount} expired idempotency keys.`);
    } catch (error) {
      console.error('[IdempotencyCleanup] Error running cleanup job:', error);
    }
  });
};

startIdempotencyCleanupJob();
