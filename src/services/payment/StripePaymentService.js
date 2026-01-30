import Stripe from 'stripe';
import Payment from '../../models/Payment.js';
import PaymentWebhook from '../../models/PaymentWebhook.js';
import { PaymentService } from './PaymentService.js';

export class StripePaymentService extends PaymentService {
  constructor() {
    super('stripe');
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    });
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  /**
   * Initialize a payment with Stripe
   * Creates a PaymentIntent for one-time payments or SetupIntent for subscriptions
   */
  async initializePayment({ amount, currency = 'USD', userId, metadata = {}, type = 'one-time' }) {
    try {
      const reference = this.generateReference();

      let paymentIntent;
      if (type === 'subscription') {
        // For subscriptions, create a SetupIntent to collect payment method
        const setupIntent = await this.stripe.setupIntents.create({
          payment_method_types: ['card'],
          metadata: {
            userId: userId.toString(),
            reference,
            ...metadata,
          },
        });
        paymentIntent = setupIntent;
      } else {
        // For one-time payments, create a PaymentIntent
        paymentIntent = await this.stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency.toLowerCase(),
          metadata: {
            userId: userId.toString(),
            reference,
            ...metadata,
          },
          automatic_payment_methods: {
            enabled: true,
          },
        });
      }

      // Store payment record
      const payment = await Payment.create({
        provider: 'stripe',
        reference,
        transactionId: paymentIntent.id,
        user: userId,
        amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        metadata: {
          ...metadata,
          clientSecret: paymentIntent.client_secret,
          type,
        },
      });

      return {
        reference,
        transactionId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        paymentId: payment._id,
      };
    } catch (error) {
      console.error('Stripe payment initialization error:', error);
      throw new Error(`Failed to initialize Stripe payment: ${error.message}`);
    }
  }

  /**
   * Verify a payment by reference
   */
  async verifyPayment(reference) {
    try {
      const payment = await Payment.findOne({ reference, provider: 'stripe' });
      if (!payment) {
        throw new Error(`Payment with reference ${reference} not found`);
      }

      // Fetch latest status from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(payment.transactionId);

      // Map Stripe status to our status
      let status = 'pending';
      if (paymentIntent.status === 'succeeded') {
        status = 'successful';
      } else if (paymentIntent.status === 'canceled' || paymentIntent.status === 'payment_failed') {
        status = 'failed';
      }

      // Update payment record if status changed
      if (payment.status !== status) {
        payment.status = status;
        payment.metadata = {
          ...payment.metadata,
          stripeStatus: paymentIntent.status,
          lastVerified: new Date(),
        };
        await payment.save();
      }

      return {
        reference: payment.reference,
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        status,
        provider: 'stripe',
        stripeStatus: paymentIntent.status,
        metadata: payment.metadata,
      };
    } catch (error) {
      console.error('Stripe payment verification error:', error);
      throw new Error(`Failed to verify Stripe payment: ${error.message}`);
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(payload, signature) {
    try {
      if (!this.webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook verification');
      }

      // Verify webhook signature
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

      // Store webhook event
      await PaymentWebhook.create({
        provider: 'stripe',
        transactionId: event.data.object.id,
        eventType: event.type,
        rawPayload: event.data.object,
        status: 'received',
      });

      // Process relevant events
      let payment = null;
      let updatedStatus = null;

      switch (event.type) {
        case 'payment_intent.succeeded':
          updatedStatus = 'successful';
          payment = await Payment.findOne({
            transactionId: event.data.object.id,
            provider: 'stripe',
          });
          break;

        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled':
          updatedStatus = 'failed';
          payment = await Payment.findOne({
            transactionId: event.data.object.id,
            provider: 'stripe',
          });
          break;

        case 'setup_intent.succeeded':
          // Handle subscription setup
          payment = await Payment.findOne({
            transactionId: event.data.object.id,
            provider: 'stripe',
          });
          if (payment) {
            updatedStatus = 'successful';
          }
          break;

        default:
          // Log other events but don't update payment status
          console.log(`Unhandled Stripe webhook event: ${event.type}`);
          return { processed: false, eventType: event.type };
      }

      // Update payment status if found
      if (payment && updatedStatus) {
        payment.status = updatedStatus;
        payment.metadata = {
          ...payment.metadata,
          stripeStatus: event.data.object.status,
          webhookProcessedAt: new Date(),
        };
        await payment.save();
      }

      // Mark webhook as processed
      await PaymentWebhook.updateOne(
        { transactionId: event.data.object.id, eventType: event.type },
        { status: 'processed', processedAt: new Date() }
      );

      return {
        processed: true,
        eventType: event.type,
        paymentId: payment?._id,
        status: updatedStatus,
      };
    } catch (error) {
      console.error('Stripe webhook processing error:', error);
      throw new Error(`Failed to process Stripe webhook: ${error.message}`);
    }
  }
}
