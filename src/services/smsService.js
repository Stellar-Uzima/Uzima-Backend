import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client;

if (accountSid && authToken && fromNumber) {
    client = twilio(accountSid, authToken);
} else {
    console.warn('Twilio credentials not found. SMS service will run in mock mode (logging to console).');
}

export const sendSMS = async (to, body) => {
    if (client) {
        try {
            const message = await client.messages.create({
                body,
                from: fromNumber,
                to,
            });
            return { success: true, messageId: message.sid };
        } catch (error) {
            console.error('Error sending SMS:', error);
            throw new Error('Failed to send SMS');
        }
    } else {
        // Mock mode
        console.log(`[MOCK SMS] To: ${to}, Body: ${body}`);
        return { success: true, messageId: 'mock-id-' + Date.now() };
    }
};
