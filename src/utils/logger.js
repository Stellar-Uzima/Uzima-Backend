import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { randomUUID } from 'crypto';

// Define log format with JSON for searchability
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define console format (more readable for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    ({ level, message, timestamp, requestId, userId, path, method, error, stack, ...metadata }) => {
      let log = `${timestamp} [${level}]`;

      if (requestId) {
        log += ` [RequestID: ${requestId}]`;
      }

      if (userId) {
        log += ` [UserID: ${userId}]`;
      }

      log += `: ${message}`;

      // Add path and method for HTTP requests
      if (path && method) {
        log += ` ${method} ${path}`;
      }

      // Add error details if present
      if (error) {
        log += ` | Error: ${error}`;
      }

      // Add stack trace for errors
      if (stack) {
        log += `\n${stack}`;
      }

      // Add any additional metadata
      const metadataKeys = Object.keys(metadata).filter(
        key => !['service', 'level', 'message', 'timestamp'].includes(key)
      );
      if (metadataKeys.length > 0) {
        const filteredMeta = {};
        metadataKeys.forEach(key => {
          filteredMeta[key] = metadata[key];
        });
        log += ` | ${JSON.stringify(filteredMeta)}`;
      }

      return log;
    }
  )
);

// Create logs directory path
const logsDir = path.join(process.cwd(), 'logs');

// Configure transports
const transports = [];

// Console transport (for development)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || 'debug',
    })
  );
} else {
  // In production, use JSON format for better log aggregation
  transports.push(
    new winston.transports.Console({
      format: logFormat,
      level: process.env.LOG_LEVEL || 'info',
    })
  );
}

// Error log file transport (only error level)
transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
  })
);

// Combined log file transport (all levels)
transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: winston.config.npm.levels, // error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
  format: logFormat,
  transports,
  defaultMeta: { service: 'uzima-backend' },
  exitOnError: false,
});

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

// Request logger middleware
function requestLogger(req, _res, next) {
  req.requestId = randomUUID();
  req.log = logger.child({ requestId: req.requestId, userId: req.user?.id });

  logger.info({
    message: 'Incoming request',
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    userId: req.user?.id,
  });
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
  logger.info({
    type: 'REQUEST',
    ...requestData,
    message: `${req.method} ${req.path}`,
  });

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

    const msg = `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`;

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error({ type: 'RESPONSE', ...responseData, message: msg });
    } else if (res.statusCode >= 400) {
      logger.warn({ type: 'RESPONSE', ...responseData, message: msg });
    } else {
      logger.info({ type: 'RESPONSE', ...responseData, message: msg });
    }
  });

  next();
}

// Create a child logger with context
export const createLogger = (context = {}) => {
  return logger.child(context);
};

// Helper methods for logging with context
export const logWithContext = (level, message, context = {}) => {
  logger.log(level, message, context);
};

// Convenience methods matching Winston log levels
export const logError = (message, error = null, context = {}) => {
  const logData = { message, ...context };

  if (error) {
    logData.error = error?.message || String(error);
    logData.stack = error?.stack;
    if (error?.cause) {
      logData.cause = error.cause;
    }
  }

  logger.error(logData);
};

export const logWarn = (message, context = {}) => {
  logger.warn({ message, ...context });
};

export const logInfo = (message, context = {}) => {
  logger.info({ message, ...context });
};

export const logDebug = (message, context = {}) => {
  logger.debug({ message, ...context });
};

export const logHttp = (message, context = {}) => {
  logger.http({ message, ...context });
};

export { logger, requestLogger, apiRequestResponseLogger, sanitizeData, sanitizeHeaders };
export default logger;
