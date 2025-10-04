import {
  accountActivationTemplate,
  passwordResetTemplate,
  healthRecordUpdateTemplate,
  appointmentReminderTemplate,
  genericTemplate,
} from '../templates/emailTemplates.js';
import { createNotification } from '../services/notificationService.js';

/**
 * Send account activation email
 * @param {Object} data
 * @param {string} data.to - Recipient email
 * @param {string} data.username - User's name
 * @param {string} data.activationLink - Activation URL
 * @param {string} data.userId - User ID
 * @param {string} data.expiresIn - Link expiration time (optional)
 */
export async function sendAccountActivationEmail(data) {
  const { to, username, activationLink, userId, expiresIn } = data;
  
  const template = accountActivationTemplate({
    username,
    activationLink,
    expiresIn,
  });

  return await createNotification({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type: 'account_activation',
    userId,
  });
}

/**
 * Send password reset email
 * @param {Object} data
 * @param {string} data.to - Recipient email
 * @param {string} data.username - User's name
 * @param {string} data.resetLink - Password reset URL
 * @param {string} data.userId - User ID
 * @param {string} data.expiresIn - Link expiration time (optional)
 */
export async function sendPasswordResetEmail(data) {
  const { to, username, resetLink, userId, expiresIn } = data;
  
  const template = passwordResetTemplate({
    username,
    resetLink,
    expiresIn,
  });

  return await createNotification({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type: 'password_reset',
    userId,
  });
}

/**
 * Send health record update email
 * @param {Object} data
 * @param {string} data.to - Recipient email
 * @param {string} data.username - Patient's name
 * @param {string} data.doctorName - Doctor's name
 * @param {string} data.recordType - Type of record updated
 * @param {string} data.updateDate - Date of update
 * @param {string} data.viewLink - Link to view records
 * @param {string} data.userId - User ID
 */
export async function sendHealthRecordUpdateEmail(data) {
  const { to, username, doctorName, recordType, updateDate, viewLink, userId } = data;
  
  const template = healthRecordUpdateTemplate({
    username,
    doctorName,
    recordType,
    updateDate,
    viewLink,
  });

  return await createNotification({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type: 'health_record_update',
    userId,
  });
}

/**
 * Send appointment reminder email
 * @param {Object} data
 * @param {string} data.to - Recipient email
 * @param {string} data.username - Patient's name
 * @param {string} data.doctorName - Doctor's name
 * @param {string} data.appointmentDate - Appointment date
 * @param {string} data.appointmentTime - Appointment time
 * @param {string} data.location - Appointment location
 * @param {string} data.rescheduleLink - Link to reschedule
 * @param {string} data.userId - User ID
 */
export async function sendAppointmentReminderEmail(data) {
  const { to, username, doctorName, appointmentDate, appointmentTime, location, rescheduleLink, userId } = data;
  
  const template = appointmentReminderTemplate({
    username,
    doctorName,
    appointmentDate,
    appointmentTime,
    location,
    rescheduleLink,
  });

  return await createNotification({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type: 'appointment_reminder',
    userId,
  });
}

/**
 * Send generic email
 * @param {Object} data
 * @param {string} data.to - Recipient email
 * @param {string} data.title - Email title
 * @param {string} data.message - Email message (HTML)
 * @param {string} data.actionText - Button text (optional)
 * @param {string} data.actionLink - Button link (optional)
 * @param {string} data.userId - User ID (optional)
 */
export async function sendGenericEmail(data) {
  const { to, title, message, actionText, actionLink, userId } = data;
  
  const template = genericTemplate({
    title,
    message,
    actionText,
    actionLink,
  });

  return await createNotification({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type: 'general',
    userId,
  });
}

export default {
  sendAccountActivationEmail,
  sendPasswordResetEmail,
  sendHealthRecordUpdateEmail,
  sendAppointmentReminderEmail,
  sendGenericEmail,
};
