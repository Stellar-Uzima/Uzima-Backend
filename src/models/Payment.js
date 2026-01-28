import mongoose from 'mongoose';
import softDeletePlugin from './plugins/softDeletePlugin.js';

const paymentSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ['stripe', 'flutterwave'],
      index: true
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    transactionId: {
      type: String,
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    amount: { type: Number, required: true },
    currency: {
      type: String,
      required: true,
      default: 'USD'
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

paymentSchema.index({ provider: 1, transactionId: 1 }, { unique: true });
paymentSchema.index({ user: 1, createdAt: -1 }); // For querying payments by user

// Apply soft delete plugin
paymentSchema.plugin(softDeletePlugin);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
