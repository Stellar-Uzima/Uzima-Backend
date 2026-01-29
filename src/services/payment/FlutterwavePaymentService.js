import Flutterwave from 'flutterwave-node-v3';
import Payment from '../../models/Payment.js';
import PaymentWebhook from '../../models/PaymentWebhook.js';
import { PaymentService } from './PaymentService.js';

export class FlutterwavePaymentService extends PaymentService {
  constructor() {
    super('flutterwave');
    const publicKey = process.env.FLUTTERWAVE_PUBLIC_KEY;
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    
    if (!publicKey || !secretKey) {
      throw new Error('FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY environment variables are required');
    }

    this.flw = new Flutterwave(publicKey, secretKey);
    this.webhookHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  }

  /**
   * Initialize a payment with Flutterwave
   * Creates a payment link for the transaction
   */
  async initializePayment({ amount, currency = 'NGN', userId, metadata = {}, type = 'one-time' }) {
    try {
      const reference = this.generateReference();

      // Get user email from metadata or use a default
      const customerEmail = metadata.email || `user_${userId}@example.com`;
      const customerName = metadata.name || `User ${userId}`;

      // Initialize payment
      const paymentData = {
        tx_ref: reference,
        amount: amount,
        currency: currency.toUpperCase(),
        redirect_url: metadata.redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/callback`,
        payment_options: 'card,account,ussd,banktransfer,mobilemoney',
        customer: {
          email: customerEmail,
          name: customerName,
          phone_number: metadata.phone || '',
        },
        customizations: {
          title: metadata.title || 'Payment',
          description: metadata.description || 'Payment for services',
          logo: metadata.logo || '',
        },
        meta: {
          userId: userId.toString(),
          reference,
          type,
          ...metadata,
        },
      };

      const response = await this.flw.Payment.initialize(paymentData);

      if (response.status !== 'success') {
        throw new Error(response.message || 'Failed to initialize Flutterwave payment');
      }

      // Store payment record
      const payment = await Payment.create({
        provider: 'flutterwave',
        reference,
        transactionId: response.data.tx_ref,
        user: userId,
        amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        metadata: {
          ...metadata,
          flwRef: response.data.flw_ref,
          paymentLink: response.data.link,
          type,
        },
      });

      return {
        reference,
        transactionId: response.data.tx_ref,
        paymentLink: response.data.link,
        flwRef: response.data.flw_ref,
        amount,
        currency: currency.toUpperCase(),
        status: 'pending',
        paymentId: payment._id,
      };
    } catch (error) {
      console.error('Flutterwave payment initialization error:', error);
      throw new Error(`Failed to initialize Flutterwave payment: ${error.message}`);
    }
  }

  /**
   * Verify a payment by reference
   */
  async verifyPayment(reference) {
    try {
      const payment = await Payment.findOne({ reference, provider: 'flutterwave' });
      if (!payment) {
        throw new Error(`Payment with reference ${reference} not found`);
      }

      // Verify payment with Flutterwave
      const response = await this.flw.Transaction.verify({ tx_ref: reference });

      if (response.status !== 'success') {
        throw new Error(response.message || 'Failed to verify Flutterwave payment');
      }

      const transaction = response.data;

      // Map Flutterwave status to our status
      let status = 'pending';
      if (transaction.status === 'successful' && transaction.amount >= payment.amount) {
        status = 'successful';
      } else if (transaction.status === 'failed' || transaction.status === 'cancelled') {
        status = 'failed';
      }

      // Update payment record if status changed
      if (payment.status !== status) {
        payment.status = status;
        payment.metadata = {
          ...payment.metadata,
          flutterwaveStatus: transaction.status,
          lastVerified: new Date(),
          transactionDetails: {
            amount: transaction.amount,
            currency: transaction.currency,
            charged_amount: transaction.charged_amount,
            processor_response: transaction.processor_response,
          },
        };
        await payment.save();
      }

      return {
        reference: payment.reference,
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        status,
        provider: 'flutterwave',
        flutterwaveStatus: transaction.status,
        metadata: payment.metadata,
      };
    } catch (error) {
      console.error('Flutterwave payment verification error:', error);
      throw new Error(`Failed to verify Flutterwave payment: ${error.message}`);
    }
  }

  /**
   * Handle Flutterwave webhook events
   */
  async handleWebhook(payload, signature) {
    try {
      // Flutterwave sends webhook with hash in header
      // Verify hash if webhook hash is configured
      if (this.webhookHash) {
        const crypto = await import('crypto');
        const hash = crypto
          .createHmac('sha256', this.webhookHash)
          .update(JSON.stringify(payload))
          .digest('hex');

        if (hash !== signature) {
          throw new Error('Invalid Flutterwave webhook signature');
        }
      }

      const event = payload;

      // Store webhook event
      await PaymentWebhook.create({
        provider: 'flutterwave',
        transactionId: event.data?.tx_ref || event.tx_ref || 'unknown',
        eventType: event.event || 'unknown',
        amount: event.data?.amount || event.amount,
        currency: event.data?.currency || event.currency,
        rawPayload: event,
        status: 'received',
      });

      // Process relevant events
      let payment = null;
      let updatedStatus = null;

      const txRef = event.data?.tx_ref || event.tx_ref;
      const eventType = event.event || event.status;

      if (eventType === 'charge.completed' || (event.data?.status === 'successful')) {
        updatedStatus = 'successful';
        payment = await Payment.findOne({
          reference: txRef,
          provider: 'flutterwave',
        });
      } else if (eventType === 'charge.failed' || (event.data?.status === 'failed')) {
        updatedStatus = 'failed';
        payment = await Payment.findOne({
          reference: txRef,
          provider: 'flutterwave',
        });
      }

      // Update payment status if found
      if (payment && updatedStatus) {
        payment.status = updatedStatus;
        payment.metadata = {
          ...payment.metadata,
          flutterwaveStatus: event.data?.status || event.status,
          webhookProcessedAt: new Date(),
          transactionDetails: event.data,
        };
        await payment.save();
      }

      // Mark webhook as processed
      if (txRef) {
        await PaymentWebhook.updateOne(
          { transactionId: txRef, eventType: eventType },
          { status: 'processed', processedAt: new Date() }
        );
      }

      return {
        processed: true,
        eventType: eventType,
        paymentId: payment?._id,
        status: updatedStatus,
      };
    } catch (error) {
      console.error('Flutterwave webhook processing error:', error);
      throw new Error(`Failed to process Flutterwave webhook: ${error.message}`);
    }
  }
}
