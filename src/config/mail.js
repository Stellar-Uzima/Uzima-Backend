import nodemailer from 'nodemailer';
import { getConfig } from './index.js';

/**
 * Create nodemailer transporter using unified config loader.
 * SMTP settings are optional if using Resend API.
 */
const createTransporter = () => {
  const { email } = getConfig();
  
  // Return null if SMTP is not configured
  if (!email.smtp.host) {
    return null;
  }
  
  return nodemailer.createTransport({
    host: email.smtp.host,
    port: email.smtp.port,
    secure: email.smtp.port === 465, // Use TLS for port 465
    auth: {
      user: email.smtp.user,
      pass: email.smtp.pass,
    },
  });
};

const transporter = createTransporter();

export default transporter;
