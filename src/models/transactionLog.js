import mongoose from 'mongoose';

// Unified schema to support both audit events and Stellar anchoring logs
// Fields used across the codebase:
// - Audit controllers/cron: action, resource, resourceId, performedBy, timestamp, details
// - Stellar logging middleware/route: userId, recordId, txHash, timestamp
const transactionLogSchema = new mongoose.Schema(
  {
    // Audit style
    action: { type: String, index: true },
    resource: { type: String, index: true },
    resourceId: { type: mongoose.Schema.Types.Mixed },
    performedBy: { type: String },
    details: { type: String },

    // Stellar tx log style
    userId: { type: String, index: true },
    recordId: { type: String },
    txHash: { type: String },

    // Common
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { minimize: true, timestamps: false }
);

transactionLogSchema.index({ action: 1, resource: 1, timestamp: -1 });

export default mongoose.model('TransactionLog', transactionLogSchema);
