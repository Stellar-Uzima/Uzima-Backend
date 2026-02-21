import mongoose from 'mongoose';

const webhookLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      enum: ['stripe', 'flutterwave'],
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
    },
    signature: {
      type: String,
      required: true,
    },
    processingId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster searching/filtering
webhookLogSchema.index({ source: 1, event: 1, createdAt: -1 });
webhookLogSchema.index({ status: 1, attempts: 1 });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

export default WebhookLog;
