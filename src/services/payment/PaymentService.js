/**
 * Base PaymentService class providing abstraction for payment providers
 * This allows easy switching between Stripe, Flutterwave, and other providers
 */
export class PaymentService {
  constructor(provider) {
    if (this.constructor === PaymentService) {
      throw new Error('PaymentService is abstract and cannot be instantiated directly');
    }
    this.provider = provider;
  }

  /**
   * Initialize a payment transaction
   * @param {Object} params - Payment initialization parameters
   * @param {number} params.amount - Amount in smallest currency unit (e.g., cents for USD)
   * @param {string} params.currency - Currency code (e.g., 'USD', 'NGN')
   * @param {string} params.userId - User ID making the payment
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Payment initialization response with reference
   */
  async initializePayment(params) {
    throw new Error('initializePayment must be implemented by subclass');
  }

  /**
   * Verify a payment transaction by reference
   * @param {string} reference - Payment reference/transaction ID
   * @returns {Promise<Object>} Payment verification response
   */
  async verifyPayment(reference) {
    throw new Error('verifyPayment must be implemented by subclass');
  }

  /**
   * Handle webhook event from payment provider
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Webhook signature for verification
   * @returns {Promise<Object>} Processed webhook data
   */
  async handleWebhook(payload, signature) {
    throw new Error('handleWebhook must be implemented by subclass');
  }

  /**
   * Generate a unique payment reference
   * @returns {string} Unique reference string
   */
  generateReference() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${this.provider}_${timestamp}_${random}`;
  }
}
