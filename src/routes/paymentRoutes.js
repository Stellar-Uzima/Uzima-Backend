import express from 'express';
import protect from '../middleware/authMiddleware.js';
import { PaymentServiceFactory } from '../services/payment/PaymentServiceFactory.js';
import Payment from '../models/Payment.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const router = express.Router();

/**
 * @swagger
 * /api/payments/initialize:
 *   post:
 *     summary: Initialize a payment transaction
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - amount
 *               - currency
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [stripe, flutterwave]
 *                 description: Payment provider to use
 *               amount:
 *                 type: number
 *                 description: Payment amount
 *               currency:
 *                 type: string
 *                 default: USD
 *                 description: Currency code (USD for Stripe, NGN for Flutterwave)
 *               type:
 *                 type: string
 *                 enum: [one-time, subscription]
 *                 default: one-time
 *                 description: Payment type
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/initialize', protect, async (req, res, next) => {
  try {
    const { provider, amount, currency, type = 'one-time', metadata = {} } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!provider || !amount || !currency) {
      throw new BadRequestError('Provider, amount, and currency are required');
    }

    if (!['stripe', 'flutterwave'].includes(provider.toLowerCase())) {
      throw new BadRequestError(
        'Invalid payment provider. Supported providers: stripe, flutterwave'
      );
    }

    if (amount <= 0) {
      throw new BadRequestError('Amount must be greater than 0');
    }

    // Create payment service instance
    const paymentService = PaymentServiceFactory.create(provider);

    // Initialize payment
    const result = await paymentService.initializePayment({
      amount,
      currency,
      userId,
      type,
      metadata: {
        ...metadata,
        userEmail: req.user.email,
        userName: req.user.name || req.user.username,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Payment initialized successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/payments/verify/{reference}:
 *   get:
 *     summary: Verify a payment transaction by reference
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment reference
 *     responses:
 *       200:
 *         description: Payment verification result
 *       404:
 *         description: Payment not found
 *       401:
 *         description: Unauthorized
 */
router.get('/verify/:reference', protect, async (req, res, next) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    // Find payment record
    const payment = await Payment.findOne({ reference, user: userId });
    if (!payment) {
      throw new NotFoundError(`Payment with reference ${reference} not found`);
    }

    // Create payment service instance
    const paymentService = PaymentServiceFactory.create(payment.provider);

    // Verify payment
    const result = await paymentService.verifyPayment(reference);

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: Get user's payment history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of payments to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of payments to skip
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [stripe, flutterwave]
 *         description: Filter by payment provider
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, successful, failed]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', protect, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;
    const { provider, status } = req.query;

    // Build query
    const query = { user: userId };
    if (provider) {
      query.provider = provider.toLowerCase();
    }
    if (status) {
      query.status = status.toLowerCase();
    }

    // Fetch payments
    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select('-metadata') // Exclude metadata for list view
      .lean();

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + limit < total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/payments/{reference}:
 *   get:
 *     summary: Get payment details by reference
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment reference
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
 *       404:
 *         description: Payment not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:reference', protect, async (req, res, next) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findOne({ reference, user: userId });
    if (!payment) {
      throw new NotFoundError(`Payment with reference ${reference} not found`);
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
