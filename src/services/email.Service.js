import transporter from '../config/mail.js';
const from = process.env.MAIL_FROM;

async function sendMail(to, subject, html) {
  await transporter.sendMail({ from, to, subject, html });
}

export default { sendMail };
