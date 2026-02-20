import mongoose from 'mongoose';

/**
 * Schema for individual row-level validation errors captured during CSV import.
 */
const rowErrorSchema = new mongoose.Schema(
  {
    row: { type: Number, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
    errors: [{ field: String, message: String }],
  },
  { _id: false }
);

/**
 * ImportJob tracks the lifecycle of a CSV import operation including
 * progress, validation errors, and the final outcome.
 */
const importJobSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, trim: true },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: 'text/csv' },
    status: {
      type: String,
      enum: ['pending', 'validating', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    rowErrors: [rowErrorSchema],
    failureReason: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

importJobSchema.index({ createdBy: 1, createdAt: -1 });
importJobSchema.index({ status: 1 });

export default mongoose.model('ImportJob', importJobSchema);
