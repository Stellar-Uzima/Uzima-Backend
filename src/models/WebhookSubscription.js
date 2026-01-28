import mongoose from 'mongoose';

const WebhookSubscriptionSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    secret: { type: String, required: true },
    eventTypes: { type: [String], default: ['*'] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

WebhookSubscriptionSchema.index({ isActive: 1 });
WebhookSubscriptionSchema.index({ eventTypes: 1 });

export default mongoose.model('WebhookSubscription', WebhookSubscriptionSchema);
