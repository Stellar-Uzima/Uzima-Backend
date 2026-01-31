// models/EmailRetry.js
import mongoose from 'mongoose';

const emailRetrySchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    originalMessageId: String,
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    nextRetryAt: {
      type: Date,
      required: true,
    },
    lastError: String,
    emailData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'retrying', 'failed', 'delivered'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

emailRetrySchema.index({ nextRetryAt: 1, status: 1 });

const EmailRetry = mongoose.model('EmailRetry', emailRetrySchema);

export default EmailRetry;
export { EmailRetry };
