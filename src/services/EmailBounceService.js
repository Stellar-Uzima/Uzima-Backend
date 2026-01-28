// services/emailBounceService.js
const EmailBounce = require('../models/EmailBounce');
const EmailRetry = require('../models/EmailRetry');
const alertService = require('./alertService');

class EmailBounceService {
  constructor() {
    this.SOFT_BOUNCE_MAX_RETRIES = 3;
    this.RETRY_DELAYS = [30, 120, 360]; // minutes: 30min, 2hr, 6hr
    this.HIGH_BOUNCE_THRESHOLD = 5; // percentage
    this.BOUNCE_CHECK_WINDOW = 1; // hours
  }

  async handleBounce(bounceData) {
    const { email, type, reason, provider, metadata = {} } = bounceData;

    // Check if bounce already exists
    let bounce = await EmailBounce.findOne({ email: email.toLowerCase() });

    if (bounce) {
      // Update existing bounce
      bounce.bounceCount += 1;
      bounce.lastBounceAt = new Date();
      bounce.type = type; // Update to latest type
      bounce.reason = reason;
      bounce.metadata = { ...bounce.metadata, ...metadata };

      if (type === 'hard' || type === 'spam_complaint') {
        bounce.isBlacklisted = true;
      }
    } else {
      // Create new bounce record
      bounce = new EmailBounce({
        email: email.toLowerCase(),
        type,
        reason,
        provider,
        metadata,
        isBlacklisted: type === 'hard' || type === 'spam_complaint',
      });
    }

    await bounce.save();

    // Handle based on type
    switch (type) {
      case 'hard':
        await this.handleHardBounce(email);
        break;
      case 'soft':
        await this.handleSoftBounce(email, metadata);
        break;
      case 'spam_complaint':
        await this.handleSpamComplaint(email);
        break;
    }

    // Check for high bounce rates
    await this.checkBounceRates();

    return bounce;
  }

  async handleHardBounce(email) {
    console.log(`Hard bounce detected for ${email}. Email blacklisted.`);

    // Cancel any pending retries
    await EmailRetry.updateMany(
      { email: email.toLowerCase(), status: { $in: ['pending', 'retrying'] } },
      { $set: { status: 'failed', lastError: 'Hard bounce - email undeliverable' } }
    );
  }

  async handleSoftBounce(email, metadata = {}) {
    // Check if we should retry
    const existingRetry = await EmailRetry.findOne({
      email: email.toLowerCase(),
      status: { $in: ['pending', 'retrying'] },
    }).sort({ createdAt: -1 });

    if (existingRetry) {
      existingRetry.retryCount += 1;

      if (existingRetry.retryCount >= this.SOFT_BOUNCE_MAX_RETRIES) {
        existingRetry.status = 'failed';
        existingRetry.lastError = 'Max retries exceeded for soft bounce';

        // Convert to hard bounce after max retries
        await EmailBounce.findOneAndUpdate(
          { email: email.toLowerCase() },
          {
            type: 'hard',
            isBlacklisted: true,
            reason: 'Converted from soft bounce after max retries',
          }
        );

        console.log(
          `Soft bounce converted to hard bounce for ${email} after ${this.SOFT_BOUNCE_MAX_RETRIES} retries`
        );
      } else {
        // Schedule next retry
        const delayMinutes = this.RETRY_DELAYS[existingRetry.retryCount - 1] || 360;
        existingRetry.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        existingRetry.status = 'pending';
      }

      await existingRetry.save();
    }

    console.log(`Soft bounce for ${email}. Retry scheduled.`);
  }

  async handleSpamComplaint(email) {
    console.log(`Spam complaint received for ${email}. Email blacklisted immediately.`);

    // Blacklist immediately
    await EmailBounce.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isBlacklisted: true },
      { upsert: true }
    );

    // Cancel pending retries
    await EmailRetry.updateMany(
      { email: email.toLowerCase(), status: { $in: ['pending', 'retrying'] } },
      { $set: { status: 'failed', lastError: 'Spam complaint received' } }
    );

    // Send alert
    await alertService.sendAlert({
      type: 'spam_complaint',
      message: `Spam complaint received for ${email}`,
      severity: 'high',
    });
  }

  async checkBounceRates() {
    const stats = await EmailBounce.getBounceStats(this.BOUNCE_CHECK_WINDOW);

    // Calculate bounce rate (you'll need to track total emails sent)
    // For now, we'll alert on absolute numbers
    const hardBounces = stats.stats.find(s => s.type === 'hard')?.count || 0;
    const spamComplaints = stats.stats.find(s => s.type === 'spam_complaint')?.count || 0;

    if (hardBounces > 10 || spamComplaints > 3) {
      await alertService.sendAlert({
        type: 'high_bounce_rate',
        message: `High bounce rate detected: ${hardBounces} hard bounces, ${spamComplaints} spam complaints in the last ${this.BOUNCE_CHECK_WINDOW} hour(s)`,
        severity: 'critical',
        data: stats,
      });
    }
  }

  async scheduleRetry(emailData) {
    const retry = new EmailRetry({
      email: emailData.to.toLowerCase(),
      originalMessageId: emailData.messageId,
      nextRetryAt: new Date(Date.now() + this.RETRY_DELAYS[0] * 60 * 1000),
      emailData: emailData,
    });

    await retry.save();
    return retry;
  }

  async isEmailDeliverable(email) {
    return await EmailBounce.isDeliverable(email);
  }
}

module.exports = new EmailBounceService();

// services/alertService.js
const nodemailer = require('nodemailer');

class AlertService {
  constructor() {
    // Configure your alert channels
    this.adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    this.slackWebhook = process.env.SLACK_WEBHOOK_URL;
  }

  async sendAlert({ type, message, severity = 'medium', data = {} }) {
    console.log(`[ALERT - ${severity.toUpperCase()}] ${type}: ${message}`);

    // Send email alert
    if (this.adminEmails.length > 0) {
      await this.sendEmailAlert(type, message, severity, data);
    }

    // Send Slack alert
    if (this.slackWebhook) {
      await this.sendSlackAlert(type, message, severity, data);
    }
  }

  async sendEmailAlert(type, message, severity, data) {
    // Configure your email transport
    const transporter = nodemailer.createTransport({
      // Your email config
    });

    const colors = {
      low: '#36a64f',
      medium: '#ff9900',
      high: '#ff0000',
      critical: '#8B0000',
    };

    try {
      await transporter.sendMail({
        from: process.env.ALERT_FROM_EMAIL,
        to: this.adminEmails.join(','),
        subject: `[${severity.toUpperCase()}] Email Bounce Alert: ${type}`,
        html: `
          <div style="background-color: ${colors[severity]}; color: white; padding: 20px;">
            <h2>${type}</h2>
            <p>${message}</p>
            ${data ? `<pre>${JSON.stringify(data, null, 2)}</pre>` : ''}
          </div>
        `,
      });
    } catch (error) {
      console.error('Failed to send email alert:', error);
    }
  }

  async sendSlackAlert(type, message, severity, data) {
    const colors = {
      low: 'good',
      medium: 'warning',
      high: 'danger',
      critical: 'danger',
    };

    try {
      await fetch(this.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [
            {
              color: colors[severity],
              title: `Email Bounce Alert: ${type}`,
              text: message,
              fields: data
                ? Object.keys(data).map(key => ({
                    title: key,
                    value: JSON.stringify(data[key]),
                    short: true,
                  }))
                : [],
              footer: 'Email Bounce System',
              ts: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
}

module.exports = new AlertService();
