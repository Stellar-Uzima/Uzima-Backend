import User from '../models/User.js';
import Record from '../models/Record.js';
import Prescription from '../models/Prescription.js';
import InventoryItem from '../models/InventoryItem.js';
import Payment from '../models/Payment.js';
import Permission from '../models/Permission.js';
import Article from '../models/Article.js';
import FileMetadata from '../models/FileMetadata.js';
import transactionLog from '../models/transactionLog.js';
import { withTransaction } from '../utils/withTransaction.js';

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Models with soft delete support and their purge configuration
 */
const MODELS_TO_PURGE = [
  {
    model: User,
    name: 'User',
    // Cascade: delete records owned by user before purging user
    beforePurge: async (doc, session) => {
      await Record.deleteMany({ createdBy: doc._id }, { session });
    },
  },
  { model: Record, name: 'Record' },
  { model: Prescription, name: 'Prescription' },
  { model: InventoryItem, name: 'InventoryItem' },
  { model: Payment, name: 'Payment' },
  { model: Permission, name: 'Permission' },
  { model: Article, name: 'Article' },
  { model: FileMetadata, name: 'FileMetadata' },
];

/**
 * Purge a single model's soft-deleted documents
 * @param {Object} modelConfig - Model configuration from MODELS_TO_PURGE
 * @param {Date} cutoff - Cutoff date for purging
 * @returns {Promise<{purged: number, errors: number}>}
 */
async function purgeModel(modelConfig, cutoff) {
  const { model, name, beforePurge } = modelConfig;
  let purged = 0;
  let errors = 0;

  try {
    // Use setOptions to include deleted documents in the query
    const itemsToPurge = await model
      .find({ deletedAt: { $lte: cutoff } })
      .setOptions({ includeDeleted: true });

    for (const item of itemsToPurge) {
      try {
        await withTransaction(async session => {
          // Execute cascade operations if defined
          if (beforePurge) {
            await beforePurge(item, session);
          }

          const itemId = item._id;
          await item.deleteOne({ session });

          // Audit log
          await transactionLog.create(
            [
              {
                action: 'purge',
                resource: name,
                resourceId: itemId,
                performedBy: 'system',
                timestamp: new Date(),
                details: `${name} permanently purged by scheduled job.`,
              },
            ],
            { session }
          );
        });
        purged++;
      } catch (err) {
        console.error(`Error purging ${name} ${item._id}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error(`Error querying ${name} for purge:`, err.message);
  }

  return { purged, errors };
}

/**
 * Main purge function - runs daily to permanently delete
 * soft-deleted items older than RETENTION_DAYS
 */
async function purgeSoftDeleted() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
  const startTime = Date.now();

  console.log(`[PurgeJob] Starting purge of items deleted before ${cutoff.toISOString()}`);

  const results = {};
  let totalPurged = 0;
  let totalErrors = 0;

  for (const modelConfig of MODELS_TO_PURGE) {
    const { purged, errors } = await purgeModel(modelConfig, cutoff);
    results[modelConfig.name] = { purged, errors };
    totalPurged += purged;
    totalErrors += errors;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `[PurgeJob] Completed in ${duration}s. Purged: ${totalPurged}, Errors: ${totalErrors}`
  );
  console.log('[PurgeJob] Results by model:', JSON.stringify(results, null, 2));

  return { results, totalPurged, totalErrors, duration };
}

/**
 * Schedule the purge job to run every day at midnight UTC
 * @param {Object} cron - node-cron instance
 */
export function schedulePurgeJob(cron) {
  cron.schedule('0 0 * * *', purgeSoftDeleted, {
    scheduled: true,
    timezone: 'UTC',
  });
  console.log('[PurgeJob] Scheduled to run daily at midnight UTC');
}

// Export for testing or manual execution
export { purgeSoftDeleted, RETENTION_DAYS };
