import mongoose from 'mongoose';
import softDeletePlugin from './plugins/softDeletePlugin.js';
import tenantPlugin from './plugins/tenantPlugin.js';

const paymentSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ['stripe', 'flutterwave'],
      index: true,
    },
    reference: {
      type: String,
      required: true,
      unique: false,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    currency: {
      type: String,
      required: true,
      default: 'USD',
    },
    status: {
      type: String,
      enum: ['pending', 'successful', 'failed'],
      default: 'pending',
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.plugin(tenantPlugin);

paymentSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
paymentSchema.index({ tenantId: 1, provider: 1, transactionId: 1 }, { unique: true });
paymentSchema.index({ tenantId: 1, user: 1, createdAt: -1 }); // For querying payments by user

// Apply soft delete plugin
paymentSchema.plugin(softDeletePlugin);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
