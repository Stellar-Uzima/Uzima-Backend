import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    transactionId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ provider: 1, transactionId: 1 }, { unique: true });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
