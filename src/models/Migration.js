import mongoose from 'mongoose';

const migrationSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      unique: true,
      index: true,
      comment: 'Migration version/number (e.g., 20240101001)',
    },
    name: {
      type: String,
      required: true,
      comment: 'Human-readable migration name',
    },
    description: {
      type: String,
      comment: 'Detailed description of what this migration does',
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'rolled-back'],
      default: 'pending',
      index: true,
      comment: 'Current status of the migration',
    },
    appliedAt: {
      type: Date,
      comment: 'Timestamp when migration was applied',
    },
    rolledBackAt: {
      type: Date,
      comment: 'Timestamp when migration was rolled back (if applicable)',
    },
    executionTime: {
      type: Number,
      comment: 'Execution time in milliseconds',
    },
    error: {
      type: String,
      comment: 'Error message if migration failed',
    },
    reversible: {
      type: Boolean,
      default: true,
      comment: 'Whether this migration can be rolled back',
    },
    batch: {
      type: Number,
      comment: 'Batch number for grouped migrations',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      comment: 'Additional metadata about the migration',
    },
  },
  {
    timestamps: true,
    collection: 'migrations',
  }
);

// Indexes for efficient querying
migrationSchema.index({ createdAt: -1 });
migrationSchema.index({ status: 1, createdAt: -1 });
migrationSchema.index({ version: 1 });

const Migration = mongoose.model('Migration', migrationSchema);

export default Migration;
