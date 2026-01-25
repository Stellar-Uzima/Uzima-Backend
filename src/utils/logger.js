import pino from 'pino';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Sensitive field patterns to sanitize
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'api_key',
  'secret',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'socialSecurityNumber',
  'dob',
  'dateOfBirth',
  'medicalHistory',
  'diagnosis',
  'prescription',
  'email',
  'phoneNumber',
  'phone',
];

// Function to sanitize sensitive data
function sanitizeData(obj, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeData(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeData(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Sanitize headers
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  if (sanitized.authorization) sanitized.authorization = '[REDACTED]';
  if (sanitized['x-api-key']) sanitized['x-api-key'] = '[REDACTED]';
  if (sanitized.cookie) sanitized.cookie = '[REDACTED]';
  return sanitized;
}

// Create base logger for console output
const consoleLogger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  base: { service: 'uzima-backend' },
  serializers: {
    error: pino.stdSerializers.err,
    req: req => ({
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers || {}),
    }),
    res: res => ({
      statusCode: res.statusCode,
    }),
  },
});

// Create file logger with daily rotation
const getDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const logFilePath = join(__dirname, '../../logs', `requests-${getDateString()}.log`);

const fileLogger = pino(
  {
    level: 'info',
    formatters: {
      level: label => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'uzima-backend' },
    serializers: {
      error: pino.stdSerializers.err,
    },
  },
  pino.destination({
    dest: logFilePath,
    sync: false,
    mkdir: true,
  })
);

// Combined logger that writes to both console and file
const logger = {
  info: (data, msg) => {
    consoleLogger.info(data, msg);
    fileLogger.info(data, msg);
  },
  error: (data, msg) => {
    consoleLogger.error(data, msg);
    fileLogger.error(data, msg);
  },
  warn: (data, msg) => {
    consoleLogger.warn(data, msg);
    fileLogger.warn(data, msg);
  },
  debug: (data, msg) => {
    consoleLogger.debug(data, msg);
    fileLogger.debug(data, msg);
  },
  child: bindings => {
    const consoleChild = consoleLogger.child(bindings);
    const fileChild = fileLogger.child(bindings);
    return {
      info: (data, msg) => {
        consoleChild.info(data, msg);
        fileChild.info(data, msg);
      },
      error: (data, msg) => {
        consoleChild.error(data, msg);
        fileChild.error(data, msg);
      },
      warn: (data, msg) => {
        consoleChild.warn(data, msg);
        fileChild.warn(data, msg);
      },
      debug: (data, msg) => {
        consoleChild.debug(data, msg);
        fileChild.debug(data, msg);
      },
    };
  },
};

// Basic request logger (existing functionality)
function requestLogger(req, res, next) {
  req.requestId = randomUUID();
  req.log = logger.child({ requestId: req.requestId, userId: req.user?.id });
  req.log.info({ path: req.path, method: req.method }, 'Incoming request');
  next();
}

// Comprehensive request/response logger middleware
function apiRequestResponseLogger(req, res, next) {
  // Skip logging for certain routes
  const skipRoutes = ['/health', '/api-docs', '/favicon.ico', '/api-docs.json'];
  if (skipRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }

  const startTime = Date.now();
  const requestId = req.correlationId || req.headers['x-correlation-id'] || randomUUID();

  // Capture request data
  const requestData = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: sanitizeData(req.query),
    headers: sanitizeHeaders(req.headers),
    body: sanitizeData(req.body),
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    userId: req.user?._id?.toString() || req.user?.id,
  };

  // Log request
  logger.info(
    {
      type: 'REQUEST',
      ...requestData,
    },
    `${req.method} ${req.path}`
  );

  // Capture original methods
  const originalSend = res.send;
  const originalJson = res.json;
  let responseBody;

  // Override res.json to capture response
  res.json = function (data) {
    responseBody = data;
    return originalJson.call(this, data);
  };

  // Override res.send to capture response
  res.send = function (data) {
    responseBody = data;
    return originalSend.call(this, data);
  };

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Parse response body if it's a string
    let parsedResponse = responseBody;
    if (typeof responseBody === 'string') {
      try {
        parsedResponse = JSON.parse(responseBody);
      } catch (e) {
        // Not JSON, keep as string
      }
    }

    const responseData = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      durationMs: duration,
      responseBody: sanitizeData(parsedResponse),
      userId: req.user?._id?.toString() || req.user?.id,
    };

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error(
        {
          type: 'RESPONSE',
          ...responseData,
        },
        `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
      );
    } else if (res.statusCode >= 400) {
      logger.warn(
        {
          type: 'RESPONSE',
          ...responseData,
        },
        `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
      );
    } else {
      logger.info(
        {
          type: 'RESPONSE',
          ...responseData,
        },
        `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
}

export { logger, requestLogger, apiRequestResponseLogger, sanitizeData, sanitizeHeaders };
