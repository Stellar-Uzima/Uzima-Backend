import WebhookLog from '../models/WebhookLog.js';
import { addWebhookJob } from '../queues/webhookProcessingQueue.js';

export const handleStripeWebhook = async (req, res, next) => {
    try {
        const signature = req.headers['stripe-signature'];
        const event = req.body; // Body is already parsed JSON, assuming express.json() worked (with verify hook preserving rawBody)

        // Log the webhook attempt
        const log = await WebhookLog.create({
            source: 'stripe',
            event: event.type || 'unknown',
            payload: event,
            status: 'pending',
            signature: signature,
            timestamp: new Date()
        });

        // Enqueue for processing
        await addWebhookJob({
            logId: log._id,
            source: 'stripe',
            event: event.type,
            payload: event
        });

        // Return 200 OK immediately to acknowledge receipt
        res.status(200).json({ received: true });
    } catch (error) {
        next(error);
    }
};

export const handleFlutterwaveWebhook = async (req, res, next) => {
    try {
        const signature = req.headers['verif-hash'];
        const event = req.body; // Flutterwave sends event data in body

        const log = await WebhookLog.create({
            source: 'flutterwave',
            event: event.event || 'payment.completed', // Flutterwave event type structure varies, usually 'event' or inferred
            payload: event,
            status: 'pending',
            signature: signature || 'none', // Should be present due to middleware
            timestamp: new Date()
        });

        await addWebhookJob({
            logId: log._id,
            source: 'flutterwave',
            event: event.event || 'payment.completed',
            payload: event
        });

        res.status(200).json({ received: true });
    } catch (error) {
        next(error);
    }
};
