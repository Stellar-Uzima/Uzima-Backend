import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import i18nextMiddleware from "i18next-http-middleware";
import i18next from "./config/i18n.js";

import connectDB from "./config/database.js"
import errorHandler from "./middleware/errorHandler.js"
import correlationIdMiddleware from "./middleware/correlationId.js"
import requestLogger from "./middleware/requestLogger.js"
import routes from "./routes/index.js"
import inventoryRoutes from "./routes/inventoryRoutes.js"
import appointmentsRouter from "./controllers/appointments.controller.js"
import specs from "./config/swagger.js"
import { setupGraphQL } from "./graphql/index.js"
import stellarRoutes from "./routes/stellar.js"
import * as Sentry from "@sentry/node"
import * as Tracing from "@sentry/tracing"
import { generalRateLimit } from "./middleware/rateLimiter.js"

import { getNetworkStatus } from './service/stellarService.js';
import { schedulePermanentDeletionJob } from './jobs/gdprJobs.js';
import { initRealtime } from './service/realtime.service.js';
import './config/redis.js';
import './cron/reminderJob.js';
import './cron/outboxJob.js';
import './cron/backupJob.js';
import './workers/emailWorker.js';

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
    new Tracing.Integrations.Express({ app }),
  ],
  tracesSampleRate: 1.0,
});

// Initialize i18n middleware
app.use(i18nextMiddleware.handle(i18next));

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(correlationIdMiddleware);
app.use(requestLogger);
app.use(correlationIdMiddleware);

// Apply general rate limiting to all routes
app.use(generalRateLimit);

// Swagger Documentation
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Uzima API Documentation",
  })
);

// Routes
app.use("/api", routes);
app.use("/api/inventory", inventoryRoutes);
app.use("/appointments", appointmentsRouter);
app.use("/stellar", stellarRoutes);

// GraphQL Setup
await setupGraphQL(app);

// Initialize GDPR background jobs
try {
  schedulePermanentDeletionJob();
  console.log("GDPR background jobs initialized");
} catch (e) {
  console.warn("GDPR jobs not loaded:", e.message);
}

// Debug route for Sentry testing
app.get("/debug-sentry", (req, res) => {
  throw new Error("Sentry test error");
});

// Error handling
app.use(errorHandler);

// Server bootstrap
const startServer = async () => {
  try {
    console.log("Checking Stellar network connectivity...");
    // const stellarStatus = await getNetworkStatus();
    // console.log(`Stellar ${stellarStatus.networkName} reachable - ledger #${stellarStatus.currentLedger}`);

    // --- Option 1: Start with WebSocket server ---
    const httpServer = require("http").createServer(app);
    const { initWebSocket } = require("./wsServer.js");
    initWebSocket(httpServer);

    httpServer.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
      console.log(`API Documentation available at http://localhost:${port}/docs`);
      console.log(`GraphQL Playground available at http://localhost:${port}/graphql`);
      console.log(`WebSocket server available at ws://localhost:${port}/ws`);
    });

    // --- Option 2: Init custom realtime service ---
    initRealtime(httpServer);
  } catch (error) {
    console.error("\x1b[31m%s\x1b[0m", "FATAL: Unable to connect to Stellar network");
    console.error(error.message);
    process.exit(1);
  }
};

startServer();

export default app;
