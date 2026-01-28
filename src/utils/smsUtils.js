import crypto from 'crypto';

// SMS service using basic HTTP requests to Twilio API
class SMSService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    this.baseUrl = 'https://api.twilio.com/2010-04-01';
  }

  // Send SMS using native https module to avoid installing new packages
  async sendSMS(to, message) {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      console.warn('Twilio credentials not configured, simulating SMS send');
      console.log(`SMS to ${to}: ${message}`);
      return { success: true, messageId: 'simulated-' + crypto.randomBytes(8).toString('hex') };
    }

    try {
      const https = await import('https');
      const querystring = await import('querystring');

      const postData = querystring.stringify({
        From: this.fromNumber,
        To: to,
        Body: message,
      });

      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const options = {
        hostname: 'api.twilio.com',
        port: 443,
        path: `/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
          let data = '';

          res.on('data', chunk => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ success: true, messageId: response.sid });
              } else {
                reject(new Error(`Twilio API error: ${response.message || 'Unknown error'}`));
              }
            } catch (error) {
              reject(new Error('Failed to parse Twilio response'));
            }
          });
        });

        req.on('error', error => {
          reject(new Error(`Request failed: ${error.message}`));
        });

        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('SMS sending failed:', error);
      throw new Error('Failed to send SMS');
    }
  }

  // Validate phone number format
  validatePhoneNumber(phoneNumber) {
    // Basic international phone number validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  // Generate verification code
  generateVerificationCode() {
    return crypto.randomInt(100000, 999999).toString();
  }
}

// Create singleton instance
const smsService = new SMSService();

// Export convenience function
export const sendSMS = async (to, message) => {
  return await smsService.sendSMS(to, message);
};

export const validatePhoneNumber = phoneNumber => {
  return smsService.validatePhoneNumber(phoneNumber);
};

export const generateVerificationCode = () => {
  return smsService.generateVerificationCode();
};

export default smsService;
