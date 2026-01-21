import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
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
import { NotFoundError } from './utils/errors.js';
import { generalRateLimit } from './middleware/rateLimiter.js';
import routes from './routes/index.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import appointmentsRouter from './controllers/appointments.controller.js';
import specs from './config/swagger.js';
import { setupGraphQL } from './graph/index.js';
import stellarRoutes from './routes/stellarRoutes.js';
import './config/redis.js';
import './cron/reminderJob.js';
import './cron/outboxJob.js';
// Backup job disabled - requires S3 configuration
// import './cron/backupJob.js';
// Email worker will be loaded conditionally in startServer
import { schedulePermanentDeletionJob } from './jobs/gdprJobs.js';
import http from 'http';

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnv();

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Initialize Sentry SDK
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [new Tracing.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
});

// Initialize i18n middleware
app.use(i18nextMiddleware.handle(i18next));

// Middleware

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(correlationIdMiddleware);

// Apply general rate limiting to all routes
app.use(generalRateLimit);

// Sentry request & tracing handlers
// app.use(Sentry.Handlers);
// app.use(Sentry.Handlers);

// Swagger Documentation
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Uzima API Documentation',
  })
);

// Routes
app.use('/api', routes);
app.use('/api/inventory', inventoryRoutes);
app.use('/appointments', appointmentsRouter);
app.use('/stellar', stellarRoutes);

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
      await import('./workers/emailWorker.js');
      // eslint-disable-next-line no-console
      console.log('Email worker initialized');
    } catch (e) {
      // Email worker not available - continue without it
      // eslint-disable-next-line no-console
      console.log('Email worker not available, continuing without it');
    }

    // Initialize webhook worker if available
    try {
      await import('./workers/webhookWorker.js');
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
      console.log(`API Documentation available at http://localhost:${port}/docs`);
      // eslint-disable-next-line no-console
      console.log(`GraphQL Playground available at http://localhost:${port}/graphql`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(httpServer, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(httpServer, 'SIGINT'));

    // --- Option 2: Init custom realtime service ---
    initRealtime(httpServer);
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
