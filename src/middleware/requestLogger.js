/**
 * Request Logger Middleware
 * Attaches a log object to req for consistent logging
 * Integrates with correlation IDs and provides structured logging
 */
const requestLogger = (req, res, next) => {
  const correlationId = req.correlationId || req.headers['x-correlation-id'];
  
  req.log = {
    error: (info) => {
      const logData = {
        correlationId,
        timestamp: new Date().toISOString(),
        level: 'error',
      };

      // Handle different info formats
      if (info && typeof info === 'object') {
        if (info.err) {
          // Structured error object
          logData.error = {
            name: info.err.name,
            message: info.err.message,
            stack: process.env.NODE_ENV !== 'production' ? info.err.stack : undefined,
          };
          if (info.correlationId) {
            logData.correlationId = info.correlationId;
          }
        } else {
          // Plain object
          Object.assign(logData, info);
        }
      } else {
        // String or other
        logData.message = info;
      }

      // eslint-disable-next-line no-console
      console.error(`[${logData.correlationId || 'NO-ID'}]`, logData);
    },
    info: (msg) => {
      const logData = {
        correlationId,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: typeof msg === 'object' ? JSON.stringify(msg) : msg,
      };
      // eslint-disable-next-line no-console
      console.log(`[${logData.correlationId || 'NO-ID'}]`, logData);
    },
    warn: (msg) => {
      const logData = {
        correlationId,
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: typeof msg === 'object' ? JSON.stringify(msg) : msg,
      };
      // eslint-disable-next-line no-console
      console.warn(`[${logData.correlationId || 'NO-ID'}]`, logData);
    },
  };
  next();
};

export default requestLogger;
