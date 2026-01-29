# Payment Integration Test Simulation

This script provides a visual demonstration of the payment integration system for screenshots and documentation.

## Quick Start

1. **Make sure your server is running:**
   ```bash
   npm run dev
   ```

2. **Get an authentication token:**
   - Register/login via the API to get a JWT token
   - Or use an existing token

3. **Set environment variables (optional):**
   ```bash
   export API_URL=http://localhost:5000
   export AUTH_TOKEN=your-jwt-token-here
   ```

4. **Run the simulation:**
   ```bash
   node test-payment-simulation.js
   ```

## What It Tests

The simulation script tests:

1. ✅ **Stripe Payment Initialization** - Creates a PaymentIntent
2. ✅ **Flutterwave Payment Initialization** - Creates a payment link
3. ✅ **Stripe Payment Verification** - Verifies payment status
4. ✅ **Flutterwave Payment Verification** - Verifies payment status
5. ✅ **Payment History** - Retrieves all payments
6. ✅ **Filtered Payment History** - Filters by provider and status
7. ✅ **Payment Details** - Gets specific payment information

## Output

The script provides:
- Color-coded test results (✅ PASS / ❌ FAIL)
- Request payloads
- API responses
- Status codes
- Summary statistics

## Screenshots

This script is designed to produce clean, professional output perfect for:
- PR documentation
- Test evidence
- API demonstration
- Documentation screenshots

## Notes

- The script requires the server to be running
- Authentication token is required for all endpoints
- Some tests may fail if the server isn't configured with payment provider keys
- This is a demonstration script - use `npm test` for actual unit tests
