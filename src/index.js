import express from 'express';
import cors from 'cors';
import compression from './middleware/compression.js';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { corsMiddleware } from './config/cors.js';
import morgan from 'morgan';
import cspNonce from './middleware/cspNonce.js';
import { getCspDirectives } from './config/csp.js';
import cspReportRoutes from './routes/cspReportRoutes.js';
import swaggerUi from 'swagger-ui-express';
import i18nextMiddleware from 'i18next-http-middleware';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { createRequire } from 'module';
import { gracefulShutdown } from './shutdown.js';
import { validateEnv } from './config/validateEnv.js';
import i18next from './config/i18n.js';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import correlationIdMiddleware from './middleware/correlationId.js';
import requestLogger from './middleware/requestLogger.js';
import { apiRequestResponseLogger } from './utils/logger.js';
import { NotFoundError } from './utils/errors.js';
import { generalRateLimit } from './middleware/rateLimiter.js';
import responseTimeMonitor from './middleware/responseTimeMonitor.js';
import apiMetricsMiddleware, {
  metricsTaggingMiddleware,
} from './middleware/apiMetricsMiddleware.js';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import routes from './routes/index.js';
import recordRoutes from './routes/recordCollabRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import appointmentsRouter from './controllers/appointments.controller.js';
import migrationRoutes from './routes/migrationRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import specs from './config/swagger.js';
import { createV1Router, createV2Router } from './routes/versions.js';
import versionRoutes from './routes/versionRoutes.js';
import { versionDetection } from './middleware/apiVersion.js';
import { setupGraphQL } from './graph/index.js';
import stellarRoutes from './routes/stellarRoutes.js';
import elasticSearchRoutes from './routes/elasticSearchRoutes.js';
import sseRoutes from './routes/sseRoutes.js';
import paymentWebhookRoutes from './routes/paymentWebhookRoutes.js';
import healthzRoutes from './routes/healthRoutes.js';
import './config/redis.js';

// Elasticsearch utilities
import {
  initializeElasticsearch,
  indexExists,
  createIndex,
} from './services/elasticsearchService.js';

// Make eventManager globally available for performance monitoring
import { eventManager } from './utils/eventEmitter.js';
global.eventManager = eventManager;
import './cron/reminderJob.js';
import './cron/outboxJob.js';
import './cron/reconciliationJob.js';
import './cron/exportCleanupJob.js';
import './cron/idempotencyCleanup.js';
// Backup job - supports both S3 and local storage
import './cron/backupJob.js';
// Email worker will be loaded conditionally in startServer
import { schedulePermanentDeletionJob } from './jobs/gdprJobs.js';
import http from 'http';
import logger, { logInfo, logWarn, logError } from './utils/logger.js';

import session from 'express-session';
import passport from './config/passport.js';
import { sessionConfig, validateOAuthConfig } from './config/oauth.js';
import { getConfig, initConfig } from './config/index.js';

// Initialize and validate configuration (must be first)
initConfig();
const config = getConfig();

// Initialize Express app
const app = express();
const port = config.server.port;

// Configure trust proxy for correct IP detection behind reverse proxies
// This enables proper X-Forwarded-For header handling
// Set to true to trust first proxy, or specify number of proxies to trust
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : 1);

// Connect to MongoDB
connectDB();

// Initialize Sentry SDK (if DSN is configured)
if (config.monitoring.sentryDsn) {
  Sentry.init({
    dsn: config.monitoring.sentryDsn,
    integrations: [new Tracing.Integrations.Express({ app })],
    tracesSampleRate: 1.0,
  });
}

// Initialize i18n middleware
app.use(i18nextMiddleware.handle(i18next));

// Middleware
app.use(cspNonce);
app.use((req, res, next) => {
  const isSwagger = req.path.startsWith('/api-docs');
  helmet({
    contentSecurityPolicy: isSwagger
      ? false
      : {
          directives: getCspDirectives(res.locals.cspNonce),
        },
  })(req, res, next);
});
app.use(corsMiddleware);
app.use(compression);
app.use(morgan('dev'));
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(correlationIdMiddleware);

// Session middleware for OAuth
app.use(session(sessionConfig));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Validate OAuth configuration
validateOAuthConfig();
// API Metrics middleware - track all requests (must be early)
app.use(apiMetricsMiddleware);
app.use(metricsTaggingMiddleware);

app.use(requestLogger);
app.use(apiRequestResponseLogger);

// Apply general rate limiting to all routes
app.use(generalRateLimit);

// API version detection middleware
app.use(versionDetection);

// Idempotency Middleware for processing duplicate requests
app.use(idempotencyMiddleware);

// Sentry request & tracing handlers
// app.use(Sentry.Handlers);
// app.use(Sentry.Handlers);

// Swagger Documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Uzima API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  })
);

// Serve raw OpenAPI JSON spec
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

// Version info endpoint
app.use(versionRoutes);

// Versioned API Routes
app.use('/api/v1', createV1Router());
app.use('/api/v2', createV2Router());

// Routes
app.use('/api', cspReportRoutes);

// Legacy routes (backward compatibility - defaults to v1)
app.use('/api', routes);
app.use('/api/records', recordRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/migrations', migrationRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/search', elasticSearchRoutes);
app.use('/appointments', appointmentsRouter);
app.use('/stellar', stellarRoutes);
app.use('/events', sseRoutes);

// Incoming Payment Webhooks
app.use('/webhooks', paymentWebhookRoutes);

// Load reminder cron job if available (guard missing dependencies)
try {
  await import('./cron/reminderJob.js');
} catch (e) {
  logWarn('Reminder job not loaded', { error: e.message });
}

// GraphQL Setup
await setupGraphQL(app);

// Initialize GDPR background jobs
try {
  schedulePermanentDeletionJob();
  logInfo('GDPR background jobs initialized');
} catch (e) {
  logWarn('GDPR jobs not loaded', { error: e.message });
}

// Debug route for Sentry testing
app.get('/debug-sentry', (req, res) => {
  throw new Error('Sentry test error');
});

// Health check endpoints (not rate-limited, used by orchestrators)
app.use('/healthz', healthzRoutes);

// 404 handler for undefined routes (must be before error handler)
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Server bootstrap
const startServer = async () => {
  try {
    logInfo('Checking Stellar network connectivity...');
    // const stellarStatus = await getNetworkStatus();
    // logger.info(`Stellar ${stellarStatus.networkName} reachable - ledger #${stellarStatus.currentLedger}`);

    // Auto-run pending migrations (if enabled)
    try {
      await autoRunMigrations();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Migration auto-run error (continuing):', error.message);
      if (process.env.MIGRATE_ON_START_FAIL_HARD === 'true') {
        throw error;
      }
    }

    // Initialize Permission Cache
    try {
      const permissionCache = (await import('./services/permissionCache.js')).default;
      await permissionCache.initialize();
      // eslint-disable-next-line no-console
      console.log('✅ Permission cache initialized successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('⚠️  Permission cache initialization failed:', error.message);
      // Continue without cache - middleware will handle missing permissions gracefully
    }

    // Initialize Elasticsearch
    try {
      await initializeElasticsearch();
      const exists = await indexExists();
      if (!exists) {
        await createIndex();
        // eslint-disable-next-line no-console
        console.log('✅ Elasticsearch index created successfully');
      } else {
        // eslint-disable-next-line no-console
        console.log('✅ Elasticsearch index already exists');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('⚠️  Elasticsearch initialization failed:', error.message);
      console.error(
        '   Search features will be limited. Ensure Elasticsearch is running on',
        process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
      );
      // Continue without Elasticsearch - the app can still run
    }

    // --- Start HTTP server ---
    const httpServer = http.createServer(app);

    // Initialize WebSocket if available
    try {
      const wsModule = await import('./wsServer.js');
      if (wsModule.initWebSocket) {
        wsModule.initWebSocket(httpServer);
        logInfo('WebSocket server initialized');
      }
    } catch (e) {
      // WebSocket server not available - continue without it
      logInfo('WebSocket server not available, continuing without it');
    }

    // Initialize realtime service if available
    try {
      const realtimeModule = await import('./services/realtime.service.js');
      if (realtimeModule.initRealtime) {
        realtimeModule.initRealtime(httpServer);
        logInfo('Realtime service initialized');
      }
    } catch (e) {
      // Realtime service not available - continue without it
      logInfo('Realtime service not available, continuing without it');
    }

    // Initialize email worker if available
    try {
      await import('./workers/emailWorker.js');
      logInfo('Email worker initialized');
      const emailWorker = await import('./workers/emailWorker.js');
      if (emailWorker?.startWorker) await emailWorker.startWorker();
      // eslint-disable-next-line no-console
      console.log('Email worker initialized');
    } catch (e) {
      // Email worker not available - continue without it
      logInfo('Email worker not available, continuing without it');
    }

    // Initialize webhook worker if available
    try {
      const webhookWorker = await import('./workers/webhookWorker.js');
      if (webhookWorker?.startWorker) await webhookWorker.startWorker();
      // eslint-disable-next-line no-console
      console.log('Webhook worker initialized');
    } catch (e) {
      logInfo('Webhook worker not available, continuing without it');
    }

    httpServer.listen(port, () => {
      logInfo(`Server is running on http://localhost:${port}`);
      logInfo(`API Documentation available at http://localhost:${port}/api-docs`);
      logInfo(`GraphQL Playground available at http://localhost:${port}/graphql`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(httpServer, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(httpServer, 'SIGINT'));
  } catch (error) {
    logError('FATAL: Unable to start server', error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
