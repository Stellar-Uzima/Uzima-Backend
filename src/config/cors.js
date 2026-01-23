/**
 * CORS Configuration Module
 * Implements origin whitelisting with 403 rejection for unauthorized origins
 *
 * Configuration:
 * Set CORS_ALLOWED_ORIGINS in .env as a comma-separated list of allowed origins
 * Example: CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
 */
import cors from 'cors';

/**
 * Parse allowed origins from environment variable
 * @returns {string[]} Array of allowed origin URLs
 */
const getAllowedOrigins = () => {
  const originsString = process.env.CORS_ALLOWED_ORIGINS || '';
  return originsString
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
};

/**
 * Custom origin validation function
 * Allows whitelisted origins and rejects others with 403
 *
 * Note: Requests without an Origin header (mobile apps, server-to-server,
 * Postman, curl) are allowed because CORS is a browser-enforced mechanism.
 * Non-browser clients don't send Origin headers and server-side authentication
 * (JWT) handles security for these cases.
 *
 * @param {string|undefined} origin - The request origin
 * @param {Function} callback - Callback function (error, allow)
 */
const originValidator = (origin, callback) => {
  const allowedOrigins = getAllowedOrigins();

  // Allow requests with no origin (mobile apps, Postman, server-to-server)
  if (!origin) {
    return callback(null, true);
  }

  // Check if origin is in whitelist
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  // Reject unauthorized origins with 403
  const error = new Error(`CORS policy: Origin '${origin}' is not allowed. Access denied.`);
  error.status = 403;
  return callback(error, false);
};

/**
 * CORS configuration options
 * - origin: Custom validator for whitelist enforcement
 * - credentials: Allow cookies and auth headers
 * - methods: Allowed HTTP methods
 * - allowedHeaders: Headers the client can send
 * - exposedHeaders: Headers the client can access from response
 * - maxAge: Cache preflight response for 24 hours
 * - optionsSuccessStatus: 204 for legacy browser support
 */
const corsOptions = {
  origin: originValidator,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID'],
  exposedHeaders: ['X-Correlation-ID'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

// Export configured CORS middleware
export const corsMiddleware = cors(corsOptions);

// Export for potential testing
export { getAllowedOrigins, corsOptions };
