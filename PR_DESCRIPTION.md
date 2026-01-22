# Feature: Secure Webhook System

## Description
Implemented a secure webhook receiving system that handles incoming webhooks from external services (Stripe, Flutterwave) with HMAC signature validation.

## Changes
- **New Model**: `WebhookLog` to store webhook attempts, payloads, and processing status.
- **New Middleware**: `webhookValidation` for verifying HMAC signatures:
  - Stripe (`Stripe-Signature` header verification)
  - Flutterwave (`verif-hash` header verification)
- **Queue Integration**: `webhookProcessingQueue` (BullMQ) for asynchronous processing and retries.
- **Worker**: `webhookProcessingWorker` to handle queued jobs and update log status.
- **Endpoints**:
  - `POST /webhooks/stripe`
  - `POST /webhooks/flutterwave`
- **Configuration**: Updated `express.json` middleware to capture `rawBody` needed for signature verification.

## Testing
- Integration tests added in `__tests__/webhooks.test.js`.
- Verified signature validation (success and failure cases).
- Verified queue enqueueing.

## Security
- All incoming webhooks are validated against `STRIPE_WEBHOOK_SECRET` and `FLUTTERWAVE_WEBHOOK_SECRET`.
- Invalid requests are rejected with `401 Unauthorized` before any processing.
