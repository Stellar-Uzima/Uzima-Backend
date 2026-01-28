import express from 'express';
import { PaymentServiceFactory } from '../services/payment/PaymentServiceFactory.js';
import { BadRequestError } from '../utils/errors.js';

const router = express.Router();

// Middleware to capture raw body for webhook signature verification
const rawBodyMiddleware = express.raw({ type: 'application/json' });

/**
 * @swagger
 * /api/payments/webhooks/stripe:
 *   post:
 *     summary: Stripe webhook endpoint
 *     tags: [Payments]
 *     description: Receives webhook events from Stripe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 */
router.post('/webhooks/stripe', rawBodyMiddleware, async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      throw new BadRequestError('Missing Stripe signature header');
    }

    const paymentService = PaymentServiceFactory.create('stripe');
    const result = await paymentService.handleWebhook(req.body, signature);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    // Return 200 to prevent Stripe from retrying invalid webhooks
    // but log the error for investigation
    res.status(200).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/payments/webhooks/flutterwave:
 *   post:
 *     summary: Flutterwave webhook endpoint
 *     tags: [Payments]
 *     description: Receives webhook events from Flutterwave
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook signature
 */
router.post('/webhooks/flutterwave', express.json(), async (req, res, next) => {
  try {
    // Flutterwave sends hash in header
    const signature = req.headers['verif-hash'] || req.headers['x-flutterwave-signature'];

    const paymentService = PaymentServiceFactory.create('flutterwave');
    const result = await paymentService.handleWebhook(req.body, signature);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    console.error('Flutterwave webhook error:', error);
    // Return 200 to prevent Flutterwave from retrying invalid webhooks
    res.status(200).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
