import mongoose from 'mongoose';

const OutboxSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true }, // e.g., 'stellar.anchor'
    payload: { type: Object, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: () => new Date(), index: true },
    idempotencyKey: { type: String, index: true },
    lastError: { type: String },
  },
  { timestamps: true }
);

OutboxSchema.index({ status: 1, nextRunAt: 1 });
OutboxSchema.index({ type: 1, idempotencyKey: 1 }, { unique: true });

export default mongoose.model('Outbox', OutboxSchema);
