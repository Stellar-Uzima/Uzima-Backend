import User from '../models/User.js';
import Record from '../models/Record.js';
import transactionLog from '../models/transactionLog.js';
import { withTransaction } from '../utils/withTransaction.js';

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function purgeSoftDeleted() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);

  // Purge Users
  const usersToPurge = await User.find({ deletedAt: { $lte: cutoff } });
  for (const user of usersToPurge) {
    await withTransaction(async session => {
      // Cascade: delete records owned by user
      await Record.deleteMany({ createdBy: user._id }, { session });
      await user.deleteOne({ session });
      // Audit log
      await transactionLog.create(
        [
          {
            action: 'purge',
            resource: 'User',
            resourceId: user._id,
            performedBy: 'system',
            timestamp: new Date(),
            details: 'User permanently purged by scheduled job.',
          },
        ],
        { session }
      );
    });
  }

  // Purge Records
  const recordsToPurge = await Record.find({ deletedAt: { $lte: cutoff } });
  for (const record of recordsToPurge) {
    await withTransaction(async session => {
      const recordId = record._id;
      await record.deleteOne({ session });
      // Audit log
      await transactionLog.create(
        [
          {
            action: 'purge',
            resource: 'Record',
            resourceId: recordId,
            performedBy: 'system',
            timestamp: new Date(),
            details: 'Record permanently purged by scheduled job.',
          },
        ],
        { session }
      );
    });
  }
}

// Run every day at midnight
export function schedulePurgeJob(cron) {
  cron.schedule('0 0 * * *', purgeSoftDeleted, {
    scheduled: true,
    timezone: 'UTC',
  });
}
