import { Worker } from 'bullmq';
import { URL } from 'url';
import transporter from '../config/mail.js';
import connectDB from '../config/database.js';
import Notification from '../models/Notification.js';
import templates from '../templates/emailTemplates.js';

function parseRedisUrl(urlString) {
  const u = new URL(urlString || 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0,
  };
}

const connection = parseRedisUrl(process.env.REDIS_URL);
const fromEmail = process.env.MAIL_FROM || 'Uzima Health <noreply@uzima.health>';

async function processJob(job) {
  const data = job.data || {};
  const to = data.to;
  let subject = data.subject;
  let html = data.html;
  let text = data.text;

  if ((!html || !subject) && (data.template || data.type)) {
    const t = data.template || data.type;
    let built;
    if (t === 'account_activation' && templates.accountActivationTemplate) built = templates.accountActivationTemplate(data.templateData || data);
    else if (t === 'password_reset' && templates.passwordResetTemplate) built = templates.passwordResetTemplate(data.templateData || data);
    else if (t === 'health_record_update' && templates.healthRecordUpdateTemplate) built = templates.healthRecordUpdateTemplate(data.templateData || data);
    else if (t === 'appointment_reminder' && templates.appointmentReminderTemplate) built = templates.appointmentReminderTemplate(data.templateData || data);
    else if (templates.genericTemplate) built = templates.genericTemplate(data.templateData || data);
    if (built) {
      subject = subject || built.subject;
      html = html || built.html;
      text = text || built.text;
    }
  }

  if (!to || !subject || !html) throw new Error('Invalid email data');

  let notification;
  if (data.notificationId) notification = await Notification.findById(data.notificationId);
  if (notification) {
    notification.metadata.attempts = (notification.metadata.attempts || 0) + 1;
    notification.metadata.lastAttemptAt = new Date();
    notification.status = 'retrying';
    await notification.save();
  }

  const info = await transporter.sendMail({ from: fromEmail, to, subject, html, text });
  if (notification) {
    notification.status = 'sent';
    notification.sentAt = new Date();
    notification.metadata.resendId = info.messageId;
    await notification.save();
  }
  return { messageId: info.messageId };
}

connectDB().then(() => {
  const worker = new Worker('email-queue', processJob, { connection, concurrency: 5 });
  worker.on('completed', (job) => {
    const id = job?.data?.notificationId;
    console.log(`Email sent${id ? ` for ${id}` : ''}`);
  });
  worker.on('failed', async (job, err) => {
    const id = job?.data?.notificationId;
    if (id) {
      const notification = await Notification.findById(id);
      if (notification) {
        notification.status = 'failed';
        notification.failedAt = new Date();
        notification.metadata.errorMessage = err.message;
        notification.metadata.errorCode = err.code || 'UNKNOWN';
        await notification.save();
      }
    }
    console.error(`Email failed${id ? ` for ${id}` : ''}: ${err.message}`);
  });
});