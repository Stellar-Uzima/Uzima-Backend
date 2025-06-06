import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import morgan from "morgan"
import swaggerUi from "swagger-ui-express"
import i18nextMiddleware from "i18next-http-middleware"
import i18next from "./config/i18n.js"

import connectDB from "./config/database.js"
import errorHandler from "./middleware/errorHandler.js"
import routes from "./routes/index.js"
import appointmentsRouter from "./controllers/appointments.controller.js"
import specs from "./config/swagger.js"
import { setupGraphQL } from "./graphql/index.js"
import "./cron/reminderJob.js"
import stellarRoutes from "./routes/stellar.js"
import * as Sentry from "@sentry/node"
import * as Tracing from "@sentry/tracing"
import { createRequire } from "module"

// Create require function for ES modules
const require = createRequire(import.meta.url)
const stellarService = require("./service/stellarService.js")

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const port = process.env.PORT || 5000

// Connect to MongoDB
connectDB()

// Initialize Sentry SDK
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [new Sentry.Integrations.Http({ tracing: true }), new Tracing.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
})

// Initialize i18n middleware
app.use(i18nextMiddleware.handle(i18next))

// Middleware
app.use(cors())
app.use(morgan("dev"))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Sentry request & tracing handlers
app.use(Sentry.Handlers.requestHandler())
app.use(Sentry.Handlers.tracingHandler())

// Swagger Documentation
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Uzima API Documentation",
  }),
)

// Routes
app.use("/api", routes)
app.use("/appointments", appointmentsRouter)
app.use("/stellar", stellarRoutes)

// GraphQL Setup
await setupGraphQL(app)

// Sentry debug route - for testing Sentry integration
app.get("/debug-sentry", (req, res) => {
  throw new Error("Sentry test error")
})

// Error handling
app.use(Sentry.Handlers.errorHandler())
app.use(errorHandler)

// Check Stellar network status before starting the server
const startServer = async () => {
  try {
    console.log("Checking Stellar network connectivity...")
    const startTime = Date.now()
    const stellarStatus = await stellarService.getNetworkStatus()
    const checkDuration = Date.now() - startTime

    console.log(
      `Stellar ${stellarStatus.networkName} reachable - ledger #${stellarStatus.currentLedger} (${stellarStatus.responseTime}ms)`,
    )

    // Start server
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`)
      console.log(`API Documentation available at http://localhost:${port}/docs`)
      console.log(`GraphQL Playground available at http://localhost:${port}/graphql`)
    })
  } catch (error) {
    console.error("\x1b[31m%s\x1b[0m", "FATAL: Unable to connect to Stellar network")
    console.error(error.message)
    process.exit(1) // Exit with error code
  }
}

startServer()

export default app
