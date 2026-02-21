import { Resend } from 'resend';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { enqueueEmail } from '../queues/emailQueue.js';
import { sendToUser } from '../wsServer.js';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.MAIL_FROM || 'Uzima Health <noreply@uzima.health>';

/**
 * Create a notification record and queue it for sending
 * @param {Object} notificationData
 * @param {string} notificationData.to - Recipient email
 * @param {string} notificationData.subject - Email subject
 * @param {string} notificationData.html - HTML content
 * @param {string} notificationData.text - Plain text content (optional)
 * @param {string} notificationData.type - Notification type
 * @param {string} notificationData.userId - User ID (optional)
 * @param {string} notificationData.channel - Delivery channel (optional)
 * @returns {Promise<Object>} Created notification
 */
export async function createNotification(notificationData) {
  const { to, subject, html, text, type, userId } = notificationData;

  // Create notification record
  const notification = new Notification({
    type: type || 'general',
    userId: userId || null,
    channel: notificationData.channel || 'email',
    recipient: {
      email: to,
      userId: userId || null,
    },
    subject,
    content: {
      html,
      text: text || null,
    },
    status: 'queued',
    provider: resend ? 'resend' : 'logged',
  });

  await notification.save();

  // Queue the email for async processing
  await enqueueEmail({
    to,
    subject,
    html,
    text,
    type,
    userId,
    notificationId: notification._id.toString(),
  });

  return notification;
}

/**
 * Send email using Resend or log if API key not available
 * @param {Object} emailData
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.text - Plain text content (optional)
 * @param {string} emailData.notificationId - Notification document ID
 * @returns {Promise<Object>} Send result
 */
export async function sendEmail(emailData) {
  const { to, subject, html, text, notificationId } = emailData;

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new Error(`Notification ${notificationId} not found`);
  }

  // Update attempt count
  notification.metadata.attempts += 1;
  notification.metadata.lastAttemptAt = new Date();
  notification.status = 'retrying';
  await notification.save();

  try {
    if (resend) {
      // Send email using Resend
      const result = await resend.emails.send({
        from: fromEmail,
        to,
        subject,
        html,
        text,
      });

      // Update notification status
      notification.status = 'sent';
      notification.sentAt = new Date();
      notification.metadata.resendId = result.id;
      await notification.save();

      console.log(`✓ Email sent via Resend: ${result.id} to ${to}`);
      return { success: true, provider: 'resend', messageId: result.id };
    } else {
      // Log email data when API key is not available
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 EMAIL LOG (RESEND_API_KEY not configured)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`From: ${fromEmail}`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Type: ${notification.type}`);
      console.log(`Notification ID: ${notificationId}`);
      console.log('─────────────────────────────────────────');
      console.log('HTML Content:');
      console.log(html);
      if (text) {
        console.log('─────────────────────────────────────────');
        console.log('Text Content:');
        console.log(text);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Update notification status
      notification.status = 'sent';
      notification.sentAt = new Date();
      notification.provider = 'logged';
      await notification.save();

      return { success: true, provider: 'logged', logged: true };
    }
  } catch (error) {
    // Update notification with error
    notification.status = 'failed';
    notification.failedAt = new Date();
    notification.metadata.errorMessage = error.message;
    notification.metadata.errorCode = error.code || 'UNKNOWN';
    await notification.save();

    console.error(`✗ Email send failed for ${to}:`, error.message);
    throw error;
  }
}

/**
 * Get notification by ID
 */
export async function getNotification(notificationId) {
  return await Notification.findById(notificationId);
}

/**
 * Get notifications with filters
 */
export async function getNotifications(filters = {}, options = {}) {
  const { status, type, email, userId } = filters;
  const { limit = 50, skip = 0, sort = { createdAt: -1 } } = options;

  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;
  if (email) query['recipient.email'] = email;
  if (userId) query['recipient.userId'] = userId;

  const notifications = await Notification.find(query).sort(sort).limit(limit).skip(skip).lean();

  const total = await Notification.countDocuments(query);

  return {
    notifications,
    total,
    limit,
    skip,
  };
}

/**
 * Retry failed notification
 */
export async function retryNotification(notificationId) {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.status !== 'failed') {
    throw new Error('Only failed notifications can be retried');
  }

  // Reset status and queue again
  notification.status = 'queued';
  await notification.save();

  await enqueueEmail({
    to: notification.recipient.email,
    subject: notification.subject,
    html: notification.content.html,
    text: notification.content.text,
    type: notification.type,
    userId: notification.recipient.userId,
    notificationId: notification._id.toString(),
  });

  return notification;
}

/**
 * Create security notification (in-app notification)
 * @param {Object} data - Notification data
 * @param {string} data.userId - User ID
 * @param {string} data.type - Notification type
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} data.priority - Priority level (low, medium, high)
 * @param {Object} data.metadata - Additional metadata
 * @returns {Promise<Object>} Created notification
 */
export async function createSecurityNotification(data) {
  const { userId, type, title, message, priority = 'medium', metadata = {} } = data;

  // Map notification types to enum values
  const typeMap = {
    NEW_DEVICE_LOGIN: 'new_device_login',
    NEW_LOCATION_LOGIN: 'new_location_login',
    IMPOSSIBLE_TRAVEL_DETECTED: 'impossible_travel_detected',
    SECURITY_ALERT: 'security_alert',
  };

  const notificationType = typeMap[type] || 'security_alert';

  // Get user info for email
  const User = (await import('../models/User.js')).default;
  const user = await User.findById(userId).select('email username').lean();

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Generate HTML email content
  const html = generateSecurityAlertEmail({
    username: user.username || 'User',
    title,
    message,
    metadata,
    priority,
  });

  // Create notification with email
  return await createNotification({
    to: user.email,
    subject: title,
    html,
    text: message,
    type: notificationType,
    userId,
  });
}

/**
 * Generate HTML email for security alerts
 * @private
 */
function generateSecurityAlertEmail({ username, title, message, metadata, priority }) {
  const priorityColors = {
    low: '#4CAF50',
    medium: '#FF9800',
    high: '#F44336',
  };

  const priorityColor = priorityColors[priority] || priorityColors.medium;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 3px solid ${priorityColor};">
              <h1 style="margin: 0; color: #333333; font-size: 24px; font-weight: 600;">
                🔒 Security Alert
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #666666; font-size: 16px; line-height: 1.5;">
                Hello ${username},
              </p>
              
              <div style="padding: 20px; background-color: ${priority === 'high' ? '#FFF3E0' : '#F5F5F5'}; border-left: 4px solid ${priorityColor}; border-radius: 4px; margin: 24px 0;">
                <h2 style="margin: 0 0 12px; color: #333333; font-size: 18px; font-weight: 600;">
                  ${title}
                </h2>
                <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">
                  ${message}
                </p>
              </div>

              ${
                metadata && Object.keys(metadata).length > 0
                  ? `
              <div style="margin: 24px 0;">
                <h3 style="margin: 0 0 12px; color: #333333; font-size: 16px; font-weight: 600;">
                  Details:
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                  ${Object.entries(metadata)
                    .filter(([key]) => !key.startsWith('_'))
                    .map(
                      ([key, value]) => `
                    <tr>
                      <td style="padding: 8px 0; color: #999999; font-size: 14px; text-transform: capitalize;">
                        ${key.replace(/_/g, ' ')}:
                      </td>
                      <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 500; text-align: right;">
                        ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </table>
              </div>
              `
                  : ''
              }

              <div style="margin: 32px 0 0; padding: 20px; background-color: #F5F5F5; border-radius: 4px;">
                <p style="margin: 0 0 12px; color: #666666; font-size: 14px; line-height: 1.6;">
                  <strong>What should you do?</strong>
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 14px; line-height: 1.6;">
                  <li>Review your recent login activity</li>
                  <li>If this wasn't you, change your password immediately</li>
                  <li>Consider enabling two-factor authentication</li>
                  <li>Remove any devices you don't recognize</li>
                </ul>
              </div>

              <div style="margin: 32px 0 0; text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'https://uzima.health'}/security/activity" 
                   style="display: inline-block; padding: 12px 32px; background-color: ${priorityColor}; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 16px;">
                  View Security Activity
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #F5F5F5; border-top: 1px solid #EEEEEE; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5; text-align: center;">
                This is an automated security alert from Uzima Health.<br>
                If you have any concerns, please contact our support team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Send a notification through a specific channel respecting user preferences
 * @param {Object} data
 * @param {string} data.userId User Document ObjectId
 * @param {string} data.type Notification Type (e.g. 'general')
 * @param {string} data.channel 'email' | 'sms' | 'in-app' | 'push'
 * @param {string|Object} data.content Text or object content
 * @param {string} [data.subject] Notification Subject
 */
export async function sendMultichannelNotification({
  userId,
  type,
  channel,
  content,
  subject = 'Notification',
}) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Opt-out check via user.preferences
  const prefs = user.preferences?.notifications || {};
  let isOptedOut = false;
  if (channel === 'in-app' && prefs['push'] === false) isOptedOut = true;
  if (channel === 'email' && prefs['email'] === false) isOptedOut = true;
  if (channel === 'sms' && prefs['sms'] === false) isOptedOut = true;

  if (isOptedOut) {
    console.log(`[NotificationService] User ${userId} opted out of ${channel} notifications.`);
    return { status: 'opted_out' };
  }

  // Batching logic (max 10/hour across all channels to prevent spam)
  const oneHourAgo = new Date(Date.now() - 3600000);
  const recentCount = await Notification.countDocuments({
    userId,
    createdAt: { $gt: oneHourAgo },
  });

  if (recentCount >= 10) {
    console.log(`[NotificationService] Rate limited for user ${userId}.`);
    return { status: 'rate_limited' };
  }

  const payloadText = typeof content === 'string' ? content : JSON.stringify(content);

  const savedNotification = await Notification.create({
    type,
    userId,
    recipient: { email: user.email, userId: user._id },
    channel,
    subject,
    content: { text: payloadText },
    status: 'pending',
    read: false,
  });

  try {
    if (channel === 'in-app') {
      sendToUser(userId, 'notification:receive', savedNotification);
      savedNotification.status = 'sent';
    } else if (channel === 'email') {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: process.env.SMTP_PORT || 587,
        auth: {
          user: process.env.SMTP_USER || 'dummy',
          pass: process.env.SMTP_PASS || 'dummy',
        },
      });
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'no-reply@uzima.com',
        to: user.email,
        subject,
        text: payloadText,
      });
      savedNotification.status = 'sent';
    } else if (channel === 'sms') {
      if (process.env.TWILIO_ACCOUNT_SID && user.phoneNumber) {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilioClient.messages.create({
          body: payloadText,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: user.phoneNumber,
        });
      } else {
        console.log(
          `[NotificationService] Missing Twilio config or User Phone Number.Logging Delivery.`
        );
      }
      savedNotification.status = 'sent';
    } else {
      console.log(
        `[NotificationService] Delivery via ${channel} attempted but unimplemented. Logging request.`
      );
      savedNotification.status = 'sent';
    }

    savedNotification.sentAt = new Date();
  } catch (error) {
    savedNotification.status = 'failed';
    savedNotification.metadata = { ...savedNotification.metadata, errorMessage: error.message };
    console.error(`[NotificationService] failed: ${error.message} `);
  }

  return await savedNotification.save();
}

export default {
  createNotification,
  createSecurityNotification,
  sendEmail,
  getNotification,
  getNotifications,
  retryNotification,
  sendMultichannelNotification,
};
