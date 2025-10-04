import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import i18nextMiddleware from 'i18next-http-middleware';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { createRequire } from 'module';

import i18next from './config/i18n.js';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import correlationIdMiddleware from './middleware/correlationId.js';
import requestLogger from './middleware/requestLogger.js';
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
import './cron/backupJob.js';
import { schedulePermanentDeletionJob } from './jobs/gdprJobs.js';
import { initRealtime } from './service/realtime.service.js';

// Create require function for ES modules (if needed)
const require = createRequire(import.meta.url);
const stellarService = require('./service/stellarService.js');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Initialize Sentry SDK
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    // new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Integrations.Express({ app }),
  ],
  tracesSampleRate: 1.0,
});

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(correlationIdMiddleware);

// Initialize i18n middleware
app.use(i18nextMiddleware.handle(i18next));

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

// Sentry debug route - for testing Sentry integration
app.get('/debug-sentry', (req, res) => {
  throw new Error('Sentry test error');
});

// Error handling
// app.use(Sentry.Handlers.errorHandler());
app.use(errorHandler);

// Check Stellar network status before starting the server
const startServer = async () => {
  try {
    // eslint-disable-next-line no-console
    console.log('Checking Stellar network connectivity...');
    // const startTime = Date.now();
    // const stellarStatus = await getNetworkStatus();
    // const checkDuration = Date.now() - startTime;

    // console.log(
    //   `Stellar ${stellarStatus.networkName} reachable - ledger #${stellarStatus.currentLedger} (${stellarStatus.responseTime}ms)`
    // );

    // Start server
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server is running on http://localhost:${port}`);
      // eslint-disable-next-line no-console
      console.log(`API Documentation available at http://localhost:${port}/docs`);
      // eslint-disable-next-line no-console
      console.log(`GraphQL Playground available at http://localhost:${port}/graphql`);
    });
    initRealtime(server);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('\x1b[31m%s\x1b[0m', 'FATAL: Unable to connect to Stellar network');
    // eslint-disable-next-line no-console
    console.error(error.message);
    process.exit(1); // Exit with error code
  }
};

startServer();

export default app;
