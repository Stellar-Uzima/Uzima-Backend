import mongoose from 'mongoose';

const reconciliationRunSchema = new mongoose.Schema(
  {
    provider: { type: String },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    summary: {
      totalPayments: { type: Number, default: 0 },
      totalWebhooks: { type: Number, default: 0 },
      matchedCount: { type: Number, default: 0 },
      orphanedWebhookCount: { type: Number, default: 0 },
      missingWebhookCount: { type: Number, default: 0 },
      amountMismatchCount: { type: Number, default: 0 },
      otherErrorCount: { type: Number, default: 0 },
    },
    matched: [
      {
        transactionId: String,
        provider: String,
        paymentId: mongoose.Schema.Types.ObjectId,
        webhookId: mongoose.Schema.Types.ObjectId,
      },
    ],
    unmatched: {
      orphanedWebhooks: [
        {
          webhookId: mongoose.Schema.Types.ObjectId,
          transactionId: String,
          provider: String,
        },
      ],
      missingWebhooks: [
        {
          paymentId: mongoose.Schema.Types.ObjectId,
          transactionId: String,
          provider: String,
        },
      ],
      amountMismatches: [
        {
          paymentId: mongoose.Schema.Types.ObjectId,
          webhookId: mongoose.Schema.Types.ObjectId,
          transactionId: String,
          provider: String,
          paymentAmount: Number,
          webhookAmount: Number,
        },
      ],
    },
    errors: [
      {
        message: String,
        details: mongoose.Schema.Types.Mixed,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

reconciliationRunSchema.index({ provider: 1, startedAt: -1 });

const ReconciliationRun = mongoose.model('ReconciliationRun', reconciliationRunSchema);

export default ReconciliationRun;
