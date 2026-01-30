// routes/webhooks.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const emailBounceService = require('../services/EmailBounceService');

// Middleware to verify SendGrid webhook signature
function verifySendGridSignature(req, res, next) {
  const signature = req.headers['x-twilio-email-event-webhook-signature'];
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature headers' });
  }

  const payload = timestamp + JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.SENDGRID_WEBHOOK_SECRET)
    .update(payload)
    .digest('base64');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

// Middleware to verify AWS SES signature
function verifySESSignature(req, res, next) {
  // AWS SNS signature verification
  // Implement based on AWS SNS documentation
  // For now, we'll use a simple token check
  const token = req.headers['x-amz-sns-message-type'];

  if (!token) {
    return res.status(401).json({ error: 'Missing SNS headers' });
  }

  next();
}

// SendGrid webhook endpoint
router.post('/sendgrid', verifySendGridSignature, async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const { email, event: eventType, reason, bounce_classification } = event;

      let bounceType;

      if (eventType === 'bounce') {
        bounceType = bounce_classification === 'hard' ? 'hard' : 'soft';
      } else if (eventType === 'spamreport') {
        bounceType = 'spam_complaint';
      } else {
        continue; // Skip non-bounce events
      }

      await emailBounceService.handleBounce({
        email,
        type: bounceType,
        reason: reason || `SendGrid ${eventType}`,
        provider: 'sendgrid',
        metadata: event,
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('SendGrid webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// AWS SES webhook endpoint
router.post('/ses', verifySESSignature, async (req, res) => {
  try {
    const message = JSON.parse(req.body.Message || '{}');
    const notificationType = message.notificationType;

    if (notificationType === 'Bounce') {
      const bounce = message.bounce;
      const bounceType = bounce.bounceType === 'Permanent' ? 'hard' : 'soft';

      for (const recipient of bounce.bouncedRecipients) {
        await emailBounceService.handleBounce({
          email: recipient.emailAddress,
          type: bounceType,
          reason: recipient.diagnosticCode || bounce.bounceSubType,
          provider: 'ses',
          metadata: message,
        });
      }
    } else if (notificationType === 'Complaint') {
      for (const recipient of message.complaint.complainedRecipients) {
        await emailBounceService.handleBounce({
          email: recipient.emailAddress,
          type: 'spam_complaint',
          reason: 'User marked as spam',
          provider: 'ses',
          metadata: message,
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('SES webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
