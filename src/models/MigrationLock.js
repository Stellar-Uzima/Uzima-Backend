import mongoose from 'mongoose';

const migrationLockSchema = new mongoose.Schema(
  {
    locked: {
      type: Boolean,
      default: false,
      index: true,
      comment: 'Whether migrations are currently locked',
    },
    lockedAt: {
      type: Date,
      comment: 'Timestamp when lock was acquired',
    },
    lockedBy: {
      type: String,
      comment: 'Process ID or identifier that holds the lock',
    },
    reason: {
      type: String,
      comment: 'Reason why migrations are locked',
    },
    expiresAt: {
      type: Date,
      comment: 'Lock expiration time (auto-release if not cleared)',
    },
  },
  {
    collection: 'migration_locks',
    timestamps: true,
  }
);

// TTL index to auto-delete expired locks after 1 hour
migrationLockSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true }
);

const MigrationLock = mongoose.model('MigrationLock', migrationLockSchema);

export default MigrationLock;
