import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import PaymentWebhook from '../models/PaymentWebhook.js';
import { StripePaymentService } from '../services/payment/StripePaymentService.js';
import { FlutterwavePaymentService } from '../services/payment/FlutterwavePaymentService.js';
import { PaymentServiceFactory } from '../services/payment/PaymentServiceFactory.js';

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          id: 'pi_test_123',
          client_secret: 'pi_test_123_secret',
          status: 'requires_payment_method',
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: 'pi_test_123',
          status: 'succeeded',
        }),
      },
      setupIntents: {
        create: vi.fn().mockResolvedValue({
          id: 'seti_test_123',
          client_secret: 'seti_test_123_secret',
        }),
      },
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              status: 'succeeded',
            },
          },
        }),
      },
    })),
  };
});

// Mock Flutterwave
vi.mock('flutterwave-node-v3', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      Payment: {
        initialize: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            tx_ref: 'flw_test_123',
            flw_ref: 'FLW_REF_123',
            link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc123',
          },
        }),
      },
      Transaction: {
        verify: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            tx_ref: 'flw_test_123',
            status: 'successful',
            amount: 1000,
            currency: 'NGN',
            charged_amount: 1000,
            processor_response: 'Successful',
          },
        }),
      },
    })),
  };
});

describe('Payment Integration Tests', () => {
  let mongoServer;
  let testUserId;

  beforeEach(async () => {
    // Setup test database
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test user ID
    testUserId = new mongoose.Types.ObjectId();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  describe('Payment Model', () => {
    it('should create a payment record', async () => {
      const payment = await Payment.create({
        provider: 'stripe',
        reference: 'test_ref_123',
        transactionId: 'pi_test_123',
        user: testUserId,
        amount: 100,
        currency: 'USD',
        status: 'pending',
      });

      expect(payment).toBeDefined();
      expect(payment.provider).toBe('stripe');
      expect(payment.reference).toBe('test_ref_123');
      expect(payment.status).toBe('pending');
    });

    it('should enforce unique reference constraint', async () => {
      await Payment.create({
        provider: 'stripe',
        reference: 'test_ref_123',
        transactionId: 'pi_test_123',
        user: testUserId,
        amount: 100,
        currency: 'USD',
      });

      await expect(
        Payment.create({
          provider: 'stripe',
          reference: 'test_ref_123',
          transactionId: 'pi_test_456',
          user: testUserId,
          amount: 200,
          currency: 'USD',
        })
      ).rejects.toThrow();
    });
  });

  describe('StripePaymentService', () => {
    let stripeService;

    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      stripeService = new StripePaymentService();
    });

    it('should initialize a one-time payment', async () => {
      const result = await stripeService.initializePayment({
        amount: 100,
        currency: 'USD',
        userId: testUserId,
        type: 'one-time',
      });

      expect(result).toBeDefined();
      expect(result.reference).toBeDefined();
      expect(result.transactionId).toBe('pi_test_123');
      expect(result.clientSecret).toBeDefined();
      expect(result.status).toBe('pending');

      // Verify payment was saved to database
      const payment = await Payment.findOne({ reference: result.reference });
      expect(payment).toBeDefined();
      expect(payment.provider).toBe('stripe');
      expect(payment.amount).toBe(100);
    });

    it('should initialize a subscription payment', async () => {
      const result = await stripeService.initializePayment({
        amount: 100,
        currency: 'USD',
        userId: testUserId,
        type: 'subscription',
      });

      expect(result).toBeDefined();
      expect(result.reference).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should verify a payment', async () => {
      // Create a payment first
      const payment = await Payment.create({
        provider: 'stripe',
        reference: 'test_ref_123',
        transactionId: 'pi_test_123',
        user: testUserId,
        amount: 100,
        currency: 'USD',
        status: 'pending',
      });

      const result = await stripeService.verifyPayment('test_ref_123');

      expect(result).toBeDefined();
      expect(result.reference).toBe('test_ref_123');
      expect(result.status).toBe('successful');

      // Verify payment status was updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('successful');
    });

    it('should handle webhook events', async () => {
      // Create a payment first
      const payment = await Payment.create({
        provider: 'stripe',
        reference: 'test_ref_123',
        transactionId: 'pi_test_123',
        user: testUserId,
        amount: 100,
        currency: 'USD',
        status: 'pending',
      });

      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';

      const webhookPayload = JSON.stringify({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_123', status: 'succeeded' } },
      });

      const result = await stripeService.handleWebhook(
        Buffer.from(webhookPayload),
        'test_signature'
      );

      expect(result.processed).toBe(true);
      expect(result.status).toBe('successful');

      // Verify payment status was updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('successful');

      // Verify webhook was stored
      const webhook = await PaymentWebhook.findOne({
        transactionId: 'pi_test_123',
      });
      expect(webhook).toBeDefined();
    });
  });

  describe('FlutterwavePaymentService', () => {
    let flutterwaveService;

    beforeEach(() => {
      process.env.FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK_test_123';
      process.env.FLUTTERWAVE_SECRET_KEY = 'FLWSEC_test_123';
      flutterwaveService = new FlutterwavePaymentService();
    });

    it('should initialize a payment', async () => {
      const result = await flutterwaveService.initializePayment({
        amount: 1000,
        currency: 'NGN',
        userId: testUserId,
        metadata: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });

      expect(result).toBeDefined();
      expect(result.reference).toBeDefined();
      expect(result.transactionId).toBe('flw_test_123');
      expect(result.paymentLink).toBeDefined();
      expect(result.status).toBe('pending');

      // Verify payment was saved to database
      const payment = await Payment.findOne({ reference: result.reference });
      expect(payment).toBeDefined();
      expect(payment.provider).toBe('flutterwave');
      expect(payment.amount).toBe(1000);
    });

    it('should verify a payment', async () => {
      // Create a payment first
      const payment = await Payment.create({
        provider: 'flutterwave',
        reference: 'flw_test_123',
        transactionId: 'flw_test_123',
        user: testUserId,
        amount: 1000,
        currency: 'NGN',
        status: 'pending',
      });

      const result = await flutterwaveService.verifyPayment('flw_test_123');

      expect(result).toBeDefined();
      expect(result.reference).toBe('flw_test_123');
      expect(result.status).toBe('successful');

      // Verify payment status was updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('successful');
    });

    it('should handle webhook events', async () => {
      // Create a payment first
      const payment = await Payment.create({
        provider: 'flutterwave',
        reference: 'flw_test_123',
        transactionId: 'flw_test_123',
        user: testUserId,
        amount: 1000,
        currency: 'NGN',
        status: 'pending',
      });

      const webhookPayload = {
        event: 'charge.completed',
        data: {
          tx_ref: 'flw_test_123',
          status: 'successful',
          amount: 1000,
          currency: 'NGN',
        },
      };

      const result = await flutterwaveService.handleWebhook(
        webhookPayload,
        'test_signature'
      );

      expect(result.processed).toBe(true);
      expect(result.status).toBe('successful');

      // Verify payment status was updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('successful');

      // Verify webhook was stored
      const webhook = await PaymentWebhook.findOne({
        transactionId: 'flw_test_123',
      });
      expect(webhook).toBeDefined();
    });
  });

  describe('PaymentServiceFactory', () => {
    it('should create Stripe service', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      const service = PaymentServiceFactory.create('stripe');
      expect(service).toBeInstanceOf(StripePaymentService);
      expect(service.provider).toBe('stripe');
    });

    it('should create Flutterwave service', () => {
      process.env.FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK_test_123';
      process.env.FLUTTERWAVE_SECRET_KEY = 'FLWSEC_test_123';
      const service = PaymentServiceFactory.create('flutterwave');
      expect(service).toBeInstanceOf(FlutterwavePaymentService);
      expect(service.provider).toBe('flutterwave');
    });

    it('should throw error for unsupported provider', () => {
      expect(() => {
        PaymentServiceFactory.create('paypal');
      }).toThrow('Unsupported payment provider: paypal');
    });

    it('should return available providers', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK_test_123';
      process.env.FLUTTERWAVE_SECRET_KEY = 'FLWSEC_test_123';

      const providers = PaymentServiceFactory.getAvailableProviders();
      expect(providers).toContain('stripe');
      expect(providers).toContain('flutterwave');
    });
  });

  describe('Payment Status Tracking', () => {
    it('should track payment status changes', async () => {
      const payment = await Payment.create({
        provider: 'stripe',
        reference: 'test_ref_123',
        transactionId: 'pi_test_123',
        user: testUserId,
        amount: 100,
        currency: 'USD',
        status: 'pending',
      });

      expect(payment.status).toBe('pending');

      // Update to successful
      payment.status = 'successful';
      await payment.save();

      const updated = await Payment.findById(payment._id);
      expect(updated.status).toBe('successful');

      // Update to failed
      updated.status = 'failed';
      await updated.save();

      const failed = await Payment.findById(payment._id);
      expect(failed.status).toBe('failed');
    });

    it('should query payments by user', async () => {
      const user2Id = new mongoose.Types.ObjectId();

      await Payment.create({
        provider: 'stripe',
        reference: 'ref1',
        transactionId: 'tx1',
        user: testUserId,
        amount: 100,
        currency: 'USD',
      });

      await Payment.create({
        provider: 'stripe',
        reference: 'ref2',
        transactionId: 'tx2',
        user: testUserId,
        amount: 200,
        currency: 'USD',
      });

      await Payment.create({
        provider: 'flutterwave',
        reference: 'ref3',
        transactionId: 'tx3',
        user: user2Id,
        amount: 300,
        currency: 'NGN',
      });

      const userPayments = await Payment.find({ user: testUserId });
      expect(userPayments).toHaveLength(2);
    });
  });
});
