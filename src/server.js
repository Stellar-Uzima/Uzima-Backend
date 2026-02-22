const express = require('express');
const { requestLogger, logger } = require('./utils/logger');

// Services / providers (adjust paths if different in your repo)
const SubscriptionScheduler = require('./services/subscriptionScheduler');
const PaymentProvider = require('./providers/paymentProvider');

// Routes
const articleEngagementRoutes = require('./routes/articleEngagementRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');

const app = express();

app.use(express.json());
app.use(requestLogger);

// Shared in-memory subscription store (replace with DB if needed)
const subscriptions = new Map();
const paymentProvider = new PaymentProvider(); // ensure this class exists and is exported

// Scheduler instance (expects a constructor like: new SubscriptionScheduler(subscriptions, paymentProvider))
const scheduler = new SubscriptionScheduler(subscriptions, paymentProvider);

// Start schedulers (methods assumed to exist)
if (typeof scheduler.startRenewalCheck === 'function') scheduler.startRenewalCheck();
if (typeof scheduler.startStatusSync === 'function') scheduler.startStatusSync();

// Register routes
app.use('/api/articles', articleEngagementRoutes);
app.use('/api/recommendations', recommendationRoutes);

/**
 * setupGraphQL: add GraphQL to the express `app`.
 * Replace the placeholder with your ApolloServer/express-graphql setup.
 */
async function setupGraphQL(app) {
  // Example placeholder:
  // const { ApolloServer } = require('apollo-server-express');
  // const server = new ApolloServer({ typeDefs, resolvers, context: ... });
  // await server.start();
  // server.applyMiddleware({ app, path: '/graphql' });

  // If you don't want GraphQL yet, keep as noop:
  return Promise.resolve();
}

// Initialize app (setup GraphQL if present) and start server
async function init() {
  try {
    await setupGraphQL(app);

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      logger.info(`Server running at http://localhost:${port}/graphql`);
      console.log(`Server running at http://localhost:${port}/graphql`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    console.error(err);
    process.exit(1);
  }
}

init();
const queueRoutes = require('./routes/queueRoutes');

// Mount under /queues
app.use('/queues', queueRoutes);
