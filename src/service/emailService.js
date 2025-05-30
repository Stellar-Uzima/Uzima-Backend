const transporter = require('../config/mail');
const from = process.env.MAIL_FROM;

async function sendMail(to, subject, html) {
  await transporter.sendMail({ from, to, subject, html });
}

module.exports = { sendMail };
