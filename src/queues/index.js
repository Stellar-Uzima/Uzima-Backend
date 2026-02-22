// src/queues/index.js
const Bull = require('bull');

const queues = {};

/**
 * Register a queue by name. Call this wherever you create queues.
 */
const registerQueue = (name, redisConfig) => {
  if (!queues[name]) {
    queues[name] = new Bull(name, { redis: redisConfig });
  }
  return queues[name];
};

/**
 * Get all registered queues
 */
const getQueues = () => queues;

/**
 * Get a single queue by name
 */
const getQueue = (name) => queues[name] || null;

module.exports = { registerQueue, getQueues, getQueue };