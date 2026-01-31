import mongoose from 'mongoose';

const paymentWebhookSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    amount: { type: Number },
    currency: { type: String },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    status: {
      type: String,
      enum: ['received', 'processed', 'ignored'],
      default: 'received',
    },
  },
  { timestamps: true }
);

paymentWebhookSchema.index({ provider: 1, transactionId: 1, eventType: 1 });

const PaymentWebhook = mongoose.model('PaymentWebhook', paymentWebhookSchema);

export default PaymentWebhook;
