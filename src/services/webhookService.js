import crypto from 'crypto';
import WebhookSubscription from '../models/WebhookSubscription.js';
import WebhookDelivery from '../models/WebhookDelivery.js';
import { enqueueWebhook } from '../queues/webhookQueue.js';

export function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSubscription({ url, secret, eventTypes, isActive }) {
  const sub = new WebhookSubscription({
    url,
    secret: secret || generateSecret(),
    eventTypes: eventTypes?.length ? eventTypes : ['*'],
    isActive: isActive !== false,
  });
  await sub.save();
  return sub;
}

export async function listSubscriptions({ limit = 50, skip = 0 } = {}) {
  const subs = await WebhookSubscription.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
  const total = await WebhookSubscription.countDocuments();
  return { subscriptions: subs, total, limit, skip };
}

export async function getSubscription(id) {
  return WebhookSubscription.findById(id);
}

export async function updateSubscription(id, updates) {
  return WebhookSubscription.findByIdAndUpdate(id, updates, { new: true });
}

export async function deleteSubscription(id) {
  return WebhookSubscription.findByIdAndDelete(id);
}

export async function triggerEvent(eventType, payload) {
  const subs = await WebhookSubscription.find({ isActive: true });
  const targets = subs.filter(
    s => s.eventTypes?.includes('*') || s.eventTypes?.includes(eventType)
  );
  const deliveries = [];
  for (const s of targets) {
    const d = new WebhookDelivery({
      subscriptionId: s._id,
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
      nextRunAt: new Date(),
    });
    await d.save();
    await enqueueWebhook({ deliveryId: d._id.toString() });
    deliveries.push(d);
  }
  return deliveries;
}

export async function retryDelivery(deliveryId) {
  const d = await WebhookDelivery.findById(deliveryId);
  if (!d) throw new Error('Delivery not found');
  if (d.status !== 'failed') throw new Error('Only failed deliveries can be retried');
  d.status = 'pending';
  await d.save();
  await enqueueWebhook({ deliveryId });
  return d;
}

export default {
  createSubscription,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  deleteSubscription,
  triggerEvent,
  retryDelivery,
  generateSecret,
};
