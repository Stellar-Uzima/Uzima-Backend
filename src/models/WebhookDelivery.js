import mongoose from 'mongoose';

const WebhookDeliverySchema = new mongoose.Schema({
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookSubscription', required: true },
  eventType: { type: String, required: true },
  payload: { type: Object, required: true },
  status: { type: String, enum: ['pending', 'processing', 'delivered', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  nextRunAt: { type: Date, default: () => new Date(), index: true },
  lastError: { type: String },
  responseCode: { type: Number },
  responseBody: { type: String },
  signature: { type: String },
}, { timestamps: true });

WebhookDeliverySchema.index({ subscriptionId: 1, createdAt: -1 });

export default mongoose.model('WebhookDelivery', WebhookDeliverySchema);