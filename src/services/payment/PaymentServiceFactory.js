import { StripePaymentService } from './StripePaymentService.js';
import { FlutterwavePaymentService } from './FlutterwavePaymentService.js';

/**
 * Factory class for creating payment service instances
 */
export class PaymentServiceFactory {
  /**
   * Create a payment service instance for the specified provider
   * @param {string} provider - Payment provider ('stripe' or 'flutterwave')
   * @returns {PaymentService} Payment service instance
   */
  static create(provider) {
    switch (provider.toLowerCase()) {
      case 'stripe':
        return new StripePaymentService();
      case 'flutterwave':
        return new FlutterwavePaymentService();
      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
  }

  /**
   * Get list of available payment providers
   * @returns {string[]} Array of provider names
   */
  static getAvailableProviders() {
    const providers = [];
    if (process.env.STRIPE_SECRET_KEY) {
      providers.push('stripe');
    }
    if (process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY) {
      providers.push('flutterwave');
    }
    return providers;
  }
}
