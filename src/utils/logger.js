const pino = require('pino');
const { randomUUID } = require('crypto');

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  },
  base: { service: 'uzima-backend' },
  serializers: { error: pino.stdSerializers.err },
});

function requestLogger(req, res, next) {
  req.requestId = randomUUID();
  req.log = logger.child({ requestId: req.requestId, userId: req.user?.id });
  req.log.info({ path: req.path, method: req.method }, 'Incoming request');
  next();
}

export { logger, requestLogger };
