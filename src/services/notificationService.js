import { Resend } from 'resend';
import Notification from '../models/Notification.js';
import { enqueueEmail } from '../queues/emailQueue.js';

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
 * @returns {Promise<Object>} Created notification
 */
export async function createNotification(notificationData) {
  const { to, subject, html, text, type, userId } = notificationData;

  // Create notification record
  const notification = new Notification({
    type: type || 'general',
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

  const notifications = await Notification.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip)
    .lean();

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

export default {
  createNotification,
  sendEmail,
  getNotification,
  getNotifications,
  retryNotification,
};
