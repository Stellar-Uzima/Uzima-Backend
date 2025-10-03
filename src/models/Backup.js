import mongoose from 'mongoose';

const backupSchema = new mongoose.Schema({
  backupId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending',
    required: true
  },
  database: {
    type: String,
    required: true
  },
  s3Key: {
    type: String,
    required: false
  },
  hash: {
    type: String,
    required: false
  },
  size: {
    type: Number,
    required: false
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    required: false
  },
  errorMessage: {
    type: String,
    required: false
  },
  metadata: {
    collections: [{
      name: String,
      documentCount: Number,
      size: Number
    }],
    totalDocuments: Number,
    totalSize: Number,
    compressionRatio: Number
  },
  retentionDate: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  verificationStatus: {
    verified: {
      type: Boolean,
      default: false
    },
    verifiedAt: Date,
    verificationHash: String
  }
}, {
  timestamps: true
});

// Index for efficient querying
backupSchema.index({ status: 1, createdAt: -1 });
backupSchema.index({ retentionDate: 1 });

// Virtual for backup age
backupSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt;
});

// Method to mark backup as completed
backupSchema.methods.markCompleted = function(s3Key, hash, size, metadata = {}) {
  this.status = 'completed';
  this.s3Key = s3Key;
  this.hash = hash;
  this.size = size;
  this.completedAt = new Date();
  this.metadata = metadata;
  return this.save();
};

// Method to mark backup as failed
backupSchema.methods.markFailed = function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.completedAt = new Date();
  return this.save();
};

// Method to verify backup integrity
backupSchema.methods.markVerified = function(verificationHash) {
  this.verificationStatus.verified = true;
  this.verificationStatus.verifiedAt = new Date();
  this.verificationStatus.verificationHash = verificationHash;
  return this.save();
};

// Static method to get backup statistics
backupSchema.statics.getBackupStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' }
      }
    }
  ]);
  
  const recentBackups = await this.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .select('backupId status createdAt size');
  
  return {
    statusCounts: stats,
    recentBackups,
    totalBackups: await this.countDocuments()
  };
};

// Static method to cleanup expired backups
backupSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    retentionDate: { $lt: new Date() }
  });
  
  return result.deletedCount;
};

const Backup = mongoose.model('Backup', backupSchema);

export default Backup;