/**
 * Email templates for common notification types
 */

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #333;
`;

const containerStyle = `
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  background-color: #ffffff;
`;

const headerStyle = `
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px;
  text-align: center;
  border-radius: 8px 8px 0 0;
`;

const contentStyle = `
  padding: 30px;
  background-color: #f9fafb;
`;

const buttonStyle = `
  display: inline-block;
  padding: 12px 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  margin: 20px 0;
`;

const footerStyle = `
  text-align: center;
  padding: 20px;
  color: #6b7280;
  font-size: 14px;
`;

/**
 * Account Activation Email Template
 */
export function accountActivationTemplate(data) {
  const { username, activationLink, expiresIn = '24 hours' } = data;

  return {
    subject: 'Activate Your Uzima Health Account',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="${baseStyle}">
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Welcome to Uzima Health! 🎉</h1>
            </div>
            <div style="${contentStyle}">
              <h2>Hello ${username},</h2>
              <p>Thank you for registering with Uzima Health. We're excited to have you on board!</p>
              <p>To complete your registration and activate your account, please click the button below:</p>
              <div style="text-align: center;">
                <a href="${activationLink}" style="${buttonStyle}">Activate My Account</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${activationLink}</p>
              <p><strong>⏰ This link will expire in ${expiresIn}.</strong></p>
              <p>If you didn't create an account with Uzima Health, please ignore this email.</p>
            </div>
            <div style="${footerStyle}">
              <p>© ${new Date().getFullYear()} Uzima Health. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Welcome to Uzima Health!

Hello ${username},

Thank you for registering with Uzima Health. We're excited to have you on board!

To complete your registration and activate your account, please visit:
${activationLink}

This link will expire in ${expiresIn}.

If you didn't create an account with Uzima Health, please ignore this email.

© ${new Date().getFullYear()} Uzima Health. All rights reserved.
    `.trim(),
  };
}

/**
 * Password Reset Email Template
 */
export function passwordResetTemplate(data) {
  const { username, resetLink, expiresIn = '15 minutes' } = data;

  return {
    subject: 'Reset Your Uzima Health Password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="${baseStyle}">
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Password Reset Request 🔐</h1>
            </div>
            <div style="${contentStyle}">
              <h2>Hello ${username},</h2>
              <p>We received a request to reset your password for your Uzima Health account.</p>
              <p>Click the button below to reset your password:</p>
              <div style="text-align: center;">
                <a href="${resetLink}" style="${buttonStyle}">Reset My Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
              <p><strong>⏰ This link will expire in ${expiresIn}.</strong></p>
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>⚠️ Security Notice:</strong></p>
                <p style="margin: 5px 0 0 0;">If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.</p>
              </div>
            </div>
            <div style="${footerStyle}">
              <p>© ${new Date().getFullYear()} Uzima Health. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Password Reset Request

Hello ${username},

We received a request to reset your password for your Uzima Health account.

To reset your password, please visit:
${resetLink}

This link will expire in ${expiresIn}.

⚠️ Security Notice:
If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.

© ${new Date().getFullYear()} Uzima Health. All rights reserved.
    `.trim(),
  };
}

/**
 * Health Record Update Email Template
 */
export function healthRecordUpdateTemplate(data) {
  const { username, doctorName, recordType, updateDate, viewLink } = data;

  return {
    subject: 'Your Health Record Has Been Updated',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="${baseStyle}">
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Health Record Update 📋</h1>
            </div>
            <div style="${contentStyle}">
              <h2>Hello ${username},</h2>
              <p>Your health record has been updated by <strong>${doctorName}</strong>.</p>
              <div style="background-color: #e0e7ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Update Details:</strong></p>
                <ul style="margin: 10px 0;">
                  <li>Record Type: ${recordType}</li>
                  <li>Updated By: ${doctorName}</li>
                  <li>Date: ${updateDate}</li>
                </ul>
              </div>
              <p>You can view your updated records by clicking the button below:</p>
              <div style="text-align: center;">
                <a href="${viewLink}" style="${buttonStyle}">View My Records</a>
              </div>
              <p>Your health information is secure and only accessible to you and your authorized healthcare providers.</p>
            </div>
            <div style="${footerStyle}">
              <p>© ${new Date().getFullYear()} Uzima Health. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Health Record Update

Hello ${username},

Your health record has been updated by ${doctorName}.

Update Details:
- Record Type: ${recordType}
- Updated By: ${doctorName}
- Date: ${updateDate}

View your updated records at:
${viewLink}

Your health information is secure and only accessible to you and your authorized healthcare providers.

© ${new Date().getFullYear()} Uzima Health. All rights reserved.
    `.trim(),
  };
}

/**
 * Appointment Reminder Email Template
 */
export function appointmentReminderTemplate(data) {
  const { username, doctorName, appointmentDate, appointmentTime, location, rescheduleLink } = data;

  return {
    subject: `Appointment Reminder - ${appointmentDate}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="${baseStyle}">
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Appointment Reminder 📅</h1>
            </div>
            <div style="${contentStyle}">
              <h2>Hello ${username},</h2>
              <p>This is a reminder about your upcoming appointment:</p>
              <div style="background-color: #dbeafe; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Appointment Details:</strong></p>
                <ul style="margin: 10px 0;">
                  <li><strong>Doctor:</strong> ${doctorName}</li>
                  <li><strong>Date:</strong> ${appointmentDate}</li>
                  <li><strong>Time:</strong> ${appointmentTime}</li>
                  <li><strong>Location:</strong> ${location}</li>
                </ul>
              </div>
              <p>Please arrive 10 minutes early to complete any necessary paperwork.</p>
              <p>Need to reschedule?</p>
              <div style="text-align: center;">
                <a href="${rescheduleLink}" style="${buttonStyle}">Reschedule Appointment</a>
              </div>
              <p>If you have any questions, please contact our office.</p>
            </div>
            <div style="${footerStyle}">
              <p>© ${new Date().getFullYear()} Uzima Health. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Appointment Reminder

Hello ${username},

This is a reminder about your upcoming appointment:

Appointment Details:
- Doctor: ${doctorName}
- Date: ${appointmentDate}
- Time: ${appointmentTime}
- Location: ${location}

Please arrive 10 minutes early to complete any necessary paperwork.

Need to reschedule? Visit:
${rescheduleLink}

If you have any questions, please contact our office.

© ${new Date().getFullYear()} Uzima Health. All rights reserved.
    `.trim(),
  };
}

/**
 * Generic Email Template
 */
export function genericTemplate(data) {
  const { title, message, actionText, actionLink } = data;

  return {
    subject: title,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="${baseStyle}">
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">${title}</h1>
            </div>
            <div style="${contentStyle}">
              ${message}
              ${
                actionLink
                  ? `
                <div style="text-align: center;">
                  <a href="${actionLink}" style="${buttonStyle}">${actionText || 'Take Action'}</a>
                </div>
              `
                  : ''
              }
            </div>
            <div style="${footerStyle}">
              <p>© ${new Date().getFullYear()} Uzima Health. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
${title}

${message.replace(/<[^>]*>/g, '')}

${actionLink ? `${actionText || 'Take Action'}: ${actionLink}` : ''}

© ${new Date().getFullYear()} Uzima Health. All rights reserved.
    `.trim(),
  };
}

export default {
  accountActivationTemplate,
  passwordResetTemplate,
  healthRecordUpdateTemplate,
  appointmentReminderTemplate,
  genericTemplate,
};
