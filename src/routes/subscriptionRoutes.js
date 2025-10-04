const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');

// Mock payment provider service (replace with Stripe, PayPal, etc.)
class PaymentProvider {
  async createSubscription(customerId, planId, paymentMethodId) {
    // Simulate API call to payment provider
    return {
      id: `sub_${Date.now()}`,
      customerId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false
    };
  }

  async cancelSubscription(subscriptionId, immediate = false) {
    return {
      id: subscriptionId,
      status: immediate ? 'canceled' : 'active',
      cancelAtPeriodEnd: !immediate,
      canceledAt: new Date()
    };
  }

  async updateSubscription(subscriptionId, updates) {
    return {
      id: subscriptionId,
      ...updates,
      updatedAt: new Date()
    };
  }

  async retrieveSubscription(subscriptionId) {
    return {
      id: subscriptionId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
  }
}

const paymentProvider = new PaymentProvider();

// Database models (using in-memory store for demo)
const subscriptions = new Map();

// Subscription status enum
const SubscriptionStatus = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
  PAST_DUE: 'past_due',
  TRIALING: 'trialing',
  INCOMPLETE: 'incomplete'
};

// Middleware for validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// POST /subscriptions - Create new subscription
router.post(
  '/subscriptions',
  [
    body('customerId').notEmpty().withMessage('Customer ID is required'),
    body('planId').notEmpty().withMessage('Plan ID is required'),
    body('paymentMethodId').notEmpty().withMessage('Payment method is required'),
    body('trialDays').optional().isInt({ min: 0 }).withMessage('Trial days must be a positive integer')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { customerId, planId, paymentMethodId, trialDays } = req.body;

      // Create subscription with payment provider
      const providerSubscription = await paymentProvider.createSubscription(
        customerId,
        planId,
        paymentMethodId
      );

      // Calculate dates
      const now = new Date();
      const trialEnd = trialDays ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null;
      const currentPeriodEnd = trialEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Store subscription locally
      const subscription = {
        id: providerSubscription.id,
        customerId,
        planId,
        paymentMethodId,
        status: trialDays ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
        providerSubscriptionId: providerSubscription.id,
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEnd,
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
        metadata: {
          syncedWithProvider: true,
          lastSyncAt: now
        }
      };

      subscriptions.set(subscription.id, subscription);

      res.status(201).json({
        success: true,
        subscription
      });
    } catch (error) {
      console.error('Subscription creation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create subscription',
        message: error.message
      });
    }
  }
);

// DELETE /subscriptions/:id - Cancel subscription
router.delete(
  '/subscriptions/:id',
  [
    param('id').notEmpty().withMessage('Subscription ID is required'),
    body('immediate').optional().isBoolean().withMessage('Immediate must be boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { immediate = false } = req.body;

      // Check if subscription exists
      const subscription = subscriptions.get(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
      }

      // Prevent canceling already canceled subscriptions
      if (subscription.status === SubscriptionStatus.CANCELED) {
        return res.status(400).json({
          success: false,
          error: 'Subscription is already canceled'
        });
      }

      // Cancel with payment provider
      const providerResponse = await paymentProvider.cancelSubscription(
        subscription.providerSubscriptionId,
        immediate
      );

      // Update local subscription
      subscription.status = immediate ? SubscriptionStatus.CANCELED : subscription.status;
      subscription.cancelAtPeriodEnd = !immediate;
      subscription.canceledAt = new Date();
      subscription.updatedAt = new Date();
      subscription.metadata.syncedWithProvider = true;
      subscription.metadata.lastSyncAt = new Date();

      subscriptions.set(id, subscription);

      res.json({
        success: true,
        subscription,
        message: immediate 
          ? 'Subscription canceled immediately'
          : 'Subscription will be canceled at period end'
      });
    } catch (error) {
      console.error('Subscription cancellation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription',
        message: error.message
      });
    }
  }
);

// PATCH /subscriptions/:id - Update/Upgrade subscription
router.patch(
  '/subscriptions/:id',
  [
    param('id').notEmpty().withMessage('Subscription ID is required'),
    body('planId').optional().notEmpty().withMessage('Plan ID cannot be empty'),
    body('paymentMethodId').optional().notEmpty().withMessage('Payment method cannot be empty'),
    body('pauseCollection').optional().isBoolean(),
    body('reactivate').optional().isBoolean()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { planId, paymentMethodId, pauseCollection, reactivate } = req.body;

      // Check if subscription exists
      const subscription = subscriptions.get(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
      }

      const updates = {};

      // Handle plan upgrade/downgrade
      if (planId && planId !== subscription.planId) {
        updates.planId = planId;
        subscription.planId = planId;
        subscription.upgradedAt = new Date();
      }

      // Handle payment method update
      if (paymentMethodId) {
        updates.paymentMethodId = paymentMethodId;
        subscription.paymentMethodId = paymentMethodId;
      }

      // Handle pause/unpause
      if (pauseCollection !== undefined) {
        updates.pauseCollection = pauseCollection;
        subscription.pauseCollection = pauseCollection;
      }

      // Handle reactivation
      if (reactivate && subscription.cancelAtPeriodEnd) {
        subscription.cancelAtPeriodEnd = false;
        subscription.canceledAt = null;
        updates.cancelAtPeriodEnd = false;
      }

      // Sync with payment provider
      await paymentProvider.updateSubscription(
        subscription.providerSubscriptionId,
        updates
      );

      subscription.updatedAt = new Date();
      subscription.metadata.syncedWithProvider = true;
      subscription.metadata.lastSyncAt = new Date();

      subscriptions.set(id, subscription);

      res.json({
        success: true,
        subscription,
        message: 'Subscription updated successfully'
      });
    } catch (error) {
      console.error('Subscription update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update subscription',
        message: error.message
      });
    }
  }
);

// GET /subscriptions/:id - Retrieve subscription (bonus endpoint)
router.get('/subscriptions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = subscriptions.get(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    // Sync with provider to ensure accuracy
    const providerSubscription = await paymentProvider.retrieveSubscription(
      subscription.providerSubscriptionId
    );

    // Update status from provider
    if (providerSubscription.status !== subscription.status) {
      subscription.status = providerSubscription.status;
      subscription.metadata.syncedWithProvider = true;
      subscription.metadata.lastSyncAt = new Date();
      subscriptions.set(id, subscription);
    }

    res.json({
      success: true,
      subscription
    });
  } catch (error) {
    console.error('Subscription retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscription',
      message: error.message
    });
  }
});

module.exports = router;