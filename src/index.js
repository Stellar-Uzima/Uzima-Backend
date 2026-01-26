import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { corsMiddleware } from './config/cors.js';
import morgan from 'morgan';
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
import apiMetricsMiddleware, { metricsTaggingMiddleware } from './middleware/apiMetricsMiddleware.js';
import routes from './routes/index.js';
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
import sseRoutes from './routes/sseRoutes.js';
import elasticSearchRoutes from './routes/elasticSearchRoutes.js';
import eventManager from './services/eventManager.js';
import { autoRunMigrations } from './services/autoRunMigrations.js';
import { initializeElasticsearch } from './config/elasticsearch.js';
import { createIndex, indexExists } from './services/elasticsearchService.js';
import './config/redis.js';

// Make eventManager globally available for performance monitoring
global.eventManager = eventManager;
import './cron/reminderJob.js';
import './cron/outboxJob.js';
import './cron/reconciliationJob.js';
// Backup job disabled - requires S3 configuration
// import './cron/backupJob.js';
// Email worker will be loaded conditionally in startServer
import { schedulePermanentDeletionJob } from './jobs/gdprJobs.js';
import http from 'http';
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

app.use(corsMiddleware);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(correlationIdMiddleware);

// API Metrics middleware - track all requests (must be early)
app.use(apiMetricsMiddleware);
app.use(metricsTaggingMiddleware);

app.use(requestLogger);
app.use(apiRequestResponseLogger);

// Apply general rate limiting to all routes
app.use(generalRateLimit);

// API version detection middleware
app.use(versionDetection);

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

// Legacy routes (backward compatibility - defaults to v1)
app.use('/api', routes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/migrations', migrationRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/search', elasticSearchRoutes);
app.use('/appointments', appointmentsRouter);
app.use('/stellar', stellarRoutes);
app.use('/events', sseRoutes);

// Load reminder cron job if available (guard missing dependencies)
try {
  await import('./cron/reminderJob.js');
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('Reminder job not loaded:', e.message);
}

// GraphQL Setup
await setupGraphQL(app);

// Initialize GDPR background jobs
try {
  schedulePermanentDeletionJob();
  // eslint-disable-next-line no-console
  console.log('GDPR background jobs initialized');
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('GDPR jobs not loaded:', e.message);
}

// Debug route for Sentry testing
app.get('/debug-sentry', (req, res) => {
  throw new Error('Sentry test error');
});

// 404 handler for undefined routes (must be before error handler)
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Server bootstrap
const startServer = async () => {
  try {
    // eslint-disable-next-line no-console
    console.log('Checking Stellar network connectivity...');
    // const stellarStatus = await getNetworkStatus();
    // console.log(`Stellar ${stellarStatus.networkName} reachable - ledger #${stellarStatus.currentLedger}`);

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
      console.error('   Search features will be limited. Ensure Elasticsearch is running on', process.env.ELASTICSEARCH_NODE || 'http://localhost:9200');
      // Continue without Elasticsearch - the app can still run
    }

    // --- Start HTTP server ---
    const httpServer = http.createServer(app);

    // Initialize WebSocket if available
    try {
      const wsModule = await import('./wsServer.js');
      if (wsModule.initWebSocket) {
        wsModule.initWebSocket(httpServer);
        // eslint-disable-next-line no-console
        console.log('WebSocket server initialized');
      }
    } catch (e) {
      // WebSocket server not available - continue without it
      // eslint-disable-next-line no-console
      console.log('WebSocket server not available, continuing without it');
    }

    // Initialize realtime service if available
    try {
      const realtimeModule = await import('./services/realtime.service.js');
      if (realtimeModule.initRealtime) {
        realtimeModule.initRealtime(httpServer);
        // eslint-disable-next-line no-console
        console.log('Realtime service initialized');
      }
    } catch (e) {
      // Realtime service not available - continue without it
      // eslint-disable-next-line no-console
      console.log('Realtime service not available, continuing without it');
    }

    // Initialize email worker if available
    try {
      const emailWorker = await import('./workers/emailWorker.js');
      if (emailWorker?.startWorker) await emailWorker.startWorker();
      // eslint-disable-next-line no-console
      console.log('Email worker initialized');
    } catch (e) {
      // Email worker not available - continue without it
      // eslint-disable-next-line no-console
      console.log('Email worker not available, continuing without it');
    }

    // Initialize webhook worker if available
    try {
      const webhookWorker = await import('./workers/webhookWorker.js');
      if (webhookWorker?.startWorker) await webhookWorker.startWorker();
      // eslint-disable-next-line no-console
      console.log('Webhook worker initialized');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Webhook worker not available, continuing without it');
    }

    httpServer.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server is running on http://localhost:${port}`);
      // eslint-disable-next-line no-console
      console.log(`API Documentation available at http://localhost:${port}/api-docs`);
      // eslint-disable-next-line no-console
      console.log(`GraphQL Playground available at http://localhost:${port}/graphql`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(httpServer, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(httpServer, 'SIGINT'));

    // --- Option 2: Init custom realtime service ---
    // initRealtime(httpServer); // Commented out - service doesn't exist
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('\x1b[31m%s\x1b[0m', 'FATAL: Unable to start server');
    // eslint-disable-next-line no-console
    console.error(error.message);
    process.exit(1);
  }
};

startServer();

export default app;
