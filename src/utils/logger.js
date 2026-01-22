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

// Request logger middleware
function requestLogger(req, _res, next) {
  req.requestId = randomUUID();
  req.log = logger.child({ requestId: req.requestId, userId: req.user?.id });
  req.log.info({
    message: 'Incoming request',
    path: req.path,
    method: req.method,
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
  const logData = {
    message,
    ...context,
  };

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

export { logger, requestLogger };
export default logger;
