import mongoose from 'mongoose';

const backupSchema = new mongoose.Schema(
  {
    backupId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending',
      required: true,
    },
    backupType: {
      type: String,
      enum: ['full', 'incremental'],
      default: 'full',
      required: true,
    },
    parentBackupId: {
      type: String,
      required: false,
      index: true,
    },
    database: {
      type: String,
      required: true,
    },
    s3Key: {
      type: String,
      required: false,
    },
    hash: {
      type: String,
      required: false,
    },
    size: {
      type: Number,
      required: false,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      required: false,
    },
    errorMessage: {
      type: String,
      required: false,
    },
    metadata: {
      collections: [
        {
          name: String,
          documentCount: Number,
          size: Number,
        },
      ],
      totalDocuments: Number,
      totalSize: Number,
      compressionRatio: Number,
    },
    retentionDate: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    verificationStatus: {
      verified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
      verificationHash: String,
    },
    backupCategory: {
      type: String,
      enum: ['standard', 'filtered'],
      default: 'standard',
      index: true,
    },
    filteredBackupMetadata: {
      filters: {
        startDate: Date,
        endDate: Date,
        recordTypes: [String],
        userId: String,
        status: [String],
      },
      collections: [String],
      recordCounts: mongoose.Schema.Types.Mixed,
      totalRecords: Number,
      filtersApplied: [String],
      exportFormat: {
        type: String,
        enum: ['json', 'csv', 'both'],
        default: 'json',
      },
    },
    filePaths: {
      jsonPath: String,
      csvPath: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
backupSchema.index({ status: 1, createdAt: -1 });
backupSchema.index({ retentionDate: 1 });
backupSchema.index({ backupCategory: 1, createdAt: -1 });
backupSchema.index({ 'filteredBackupMetadata.filters.userId': 1 });

// Virtual for backup age
backupSchema.virtual('age').get(function () {
  return Date.now() - this.createdAt;
});

// Method to mark backup as completed
backupSchema.methods.markCompleted = function (s3Key, hash, size, metadata = {}) {
  this.status = 'completed';
  this.s3Key = s3Key;
  this.hash = hash;
  this.size = size;
  this.completedAt = new Date();
  this.metadata = metadata;
  return this.save();
};

// Method to mark filtered backup as completed
backupSchema.methods.markFilteredBackupCompleted = function (filteredMetadata, filePaths) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.backupCategory = 'filtered';
  this.filteredBackupMetadata = filteredMetadata;
  this.filePaths = filePaths;
  return this.save();
};

// Method to mark backup as failed
backupSchema.methods.markFailed = function (errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.completedAt = new Date();
  return this.save();
};

// Method to verify backup integrity
backupSchema.methods.markVerified = function (verificationHash) {
  this.verificationStatus.verified = true;
  this.verificationStatus.verifiedAt = new Date();
  this.verificationStatus.verificationHash = verificationHash;
  return this.save();
};

// Static method to get backup statistics
backupSchema.statics.getBackupStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' },
      },
    },
  ]);

  const recentBackups = await this.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .select('backupId status createdAt size');

  return {
    statusCounts: stats,
    recentBackups,
    totalBackups: await this.countDocuments(),
  };
};

// Static method to cleanup expired backups
backupSchema.statics.cleanupExpired = async function () {
  const result = await this.deleteMany({
    retentionDate: { $lt: new Date() },
  });

  return result.deletedCount;
};

// Static method to get backup chain (full backup + its incrementals)
backupSchema.statics.getBackupChain = async function (fullBackupId) {
  const fullBackup = await this.findOne({ backupId: fullBackupId, backupType: 'full' });
  if (!fullBackup) {
    throw new Error(`Full backup not found: ${fullBackupId}`);
  }

  const incrementals = await this.find({
    parentBackupId: fullBackupId,
    backupType: 'incremental',
    status: 'completed',
  }).sort({ createdAt: 1 });

  return {
    fullBackup,
    incrementals,
  };
};

// Static method to get latest full backup
backupSchema.statics.getLatestFullBackup = async function () {
  return await this.findOne({
    backupType: 'full',
    status: 'completed',
  }).sort({ createdAt: -1 });
};

// Method to get all incremental backups in this chain
backupSchema.methods.getIncrementalChain = async function () {
  if (this.backupType !== 'full') {
    return [];
  }

  return await this.constructor
    .find({
      parentBackupId: this.backupId,
      backupType: 'incremental',
      status: 'completed',
    })
    .sort({ createdAt: 1 });
};

const Backup = mongoose.model('Backup', backupSchema);

export default Backup;
