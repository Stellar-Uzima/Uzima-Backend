import IdempotencyKey from '../models/IdempotencyKey.js';

export const idempotencyMiddleware = async (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const key = req.headers['idempotency-key'];
  if (!key) {
    return next();
  }

  try {
    const existingKey = await IdempotencyKey.findOne({ key });

    if (existingKey && existingKey.response) {
      const { statusCode, body, headers } = existingKey.response;
      if (headers) {
        Object.entries(headers).forEach(([headerName, headerValue]) => {
          res.setHeader(headerName, headerValue);
        });
      }
      return res.status(statusCode).json(body);
    }

    if (existingKey) {
      // Request is in progress but no response yet (conflict)
      return res.status(409).json({ error: 'Request is already processing' });
    }

    // Save key immediately to lock
    await IdempotencyKey.create({
      key,
      expiresAt: new Date(), // TTL will remove it after 24h
    });

    // Capture response
    const originalJson = res.json;
    res.json = function (body) {
      const statusCode = res.statusCode;
      // We don't await this because we want to send the response to the user as quickly as possible
      IdempotencyKey.updateOne(
        { key },
        {
          $set: {
            response: {
              statusCode,
              body,
              headers: res.getHeaders(),
            },
          },
        }
      ).catch(error => console.error('Error saving idempotency response', error));

      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    console.error('Idempotency middleware error', error);
    next();
  }
};
