import express from 'express';
import { handleStripeWebhook, handleFlutterwaveWebhook } from '../controllers/webhookController.js';
import { validateStripeSignature, validateFlutterwaveSignature } from '../middleware/webhookValidation.js';

const router = express.Router();

router.post('/stripe', validateStripeSignature, handleStripeWebhook);
router.post('/flutterwave', validateFlutterwaveSignature, handleFlutterwaveWebhook);

export default router;
