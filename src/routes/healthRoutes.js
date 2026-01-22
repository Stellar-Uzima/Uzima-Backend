import express from 'express';
import mongoose from 'mongoose';
import { createClient } from 'redis';
import os from 'os';
import { register, collectDefaultMetrics, Gauge } from 'prom-client';
import CircuitBreaker from 'opossum';
import axios from 'axios';

const router = express.Router();

// Initialize Prometheus metrics
collectDefaultMetrics();

// Custom metrics
const uptimeGauge = new Gauge({
  name: 'app_uptime_seconds',
  help: 'Application uptime in seconds',
});

const healthCheckDuration = new Gauge({
  name: 'health_check_duration_seconds',
  help: 'Time taken for health checks',
});

// Circuit breaker for external API calls
const externalApiBreaker = new CircuitBreaker(
  async url => {
    const response = await axios.get(url, { timeout: 5000 });
    return response.status === 200;
  },
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

// Get Redis client (assuming it's already configured)
let redisClient;
try {
  // Import the Redis client from config
  const { default: redisConfig } = await import('../config/redis.js');
  redisClient = redisConfig;
} catch (error) {
  console.warn('Redis config not found, health checks will skip Redis');
}

// Helper functions for health checks
const checkMongoDB = async () => {
  try {
    const state = mongoose.connection.readyState;
    if (state === 1) {
      return { status: 'healthy', message: 'Connected' };
    } else {
      return { status: 'unhealthy', message: `Connection state: ${state}` };
    }
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

const checkRedis = async () => {
  if (!redisClient) {
    return { status: 'unknown', message: 'Redis client not configured' };
  }

  try {
    await redisClient.ping();
    return { status: 'healthy', message: 'Connected' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

const checkDiskSpace = () => {
  try {
    const diskUsage = require('diskusage');
    const { available, total } = diskUsage.checkSync('/');
    const availableGB = (available / 1024 ** 3).toFixed(2);
    const totalGB = (total / 1024 ** 3).toFixed(2);
    const usagePercent = (((total - available) / total) * 100).toFixed(2);

    return {
      status: usagePercent > 90 ? 'warning' : 'healthy',
      message: `${availableGB}GB available of ${totalGB}GB (${usagePercent}% used)`,
      available: available,
      total: total,
      usagePercent: parseFloat(usagePercent),
    };
  } catch (error) {
    return { status: 'unknown', message: `Unable to check disk space: ${error.message}` };
  }
};

const checkMemoryUsage = () => {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercent = ((usedMemory / totalMemory) * 100).toFixed(2);

    return {
      status: usagePercent > 90 ? 'warning' : 'healthy',
      message: `${(usedMemory / 1024 ** 3).toFixed(2)}GB used of ${(totalMemory / 1024 ** 3).toFixed(2)}GB (${usagePercent}% used)`,
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      usagePercent: parseFloat(usagePercent),
    };
  } catch (error) {
    return { status: 'unknown', message: error.message };
  }
};

const checkExternalAPI = async url => {
  try {
    const result = await externalApiBreaker.fire(url);
    return { status: 'healthy', message: 'Reachable' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

// Basic health endpoint
router.get('/health', (req, res) => {
  const uptime = process.uptime();
  uptimeGauge.set(uptime);

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: uptime,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Detailed health endpoint
router.get('/health/detailed', async (req, res) => {
  const startTime = Date.now();

  try {
    const [mongoStatus, redisStatus, diskStatus, memoryStatus] = await Promise.allSettled([
      checkMongoDB(),
      checkRedis(),
      Promise.resolve(checkDiskSpace()),
      Promise.resolve(checkMemoryUsage()),
    ]);

    // Check external APIs (example URLs - should be configurable)
    const externalApis = process.env.EXTERNAL_API_URLS
      ? process.env.EXTERNAL_API_URLS.split(',')
      : [];
    const externalChecks = await Promise.allSettled(
      externalApis.map(url => checkExternalAPI(url.trim()))
    );

    const components = {
      mongodb:
        mongoStatus.status === 'fulfilled'
          ? mongoStatus.value
          : { status: 'error', message: mongoStatus.reason },
      redis:
        redisStatus.status === 'fulfilled'
          ? redisStatus.value
          : { status: 'error', message: mongoStatus.reason },
      disk:
        diskStatus.status === 'fulfilled'
          ? diskStatus.value
          : { status: 'error', message: diskStatus.reason },
      memory:
        memoryStatus.status === 'fulfilled'
          ? memoryStatus.value
          : { status: 'error', message: memoryStatus.reason },
    };

    // Add external APIs
    externalApis.forEach((url, index) => {
      const check = externalChecks[index];
      components[`external_api_${index + 1}`] =
        check.status === 'fulfilled' ? check.value : { status: 'error', message: check.reason };
    });

    // Determine overall status
    const criticalComponents = ['mongodb'];
    const hasCriticalFailure = criticalComponents.some(
      comp => components[comp].status === 'unhealthy' || components[comp].status === 'error'
    );

    const hasWarnings = Object.values(components).some(
      comp => comp.status === 'warning' || comp.status === 'unhealthy'
    );

    let overallStatus = 'healthy';
    let httpStatus = 200;

    if (hasCriticalFailure) {
      overallStatus = 'unhealthy';
      httpStatus = 503;
    } else if (hasWarnings) {
      overallStatus = 'degraded';
      httpStatus = 200;
    }

    const duration = (Date.now() - startTime) / 1000;
    healthCheckDuration.set(duration);

    res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration: `${duration.toFixed(3)}s`,
      components,
    });
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    healthCheckDuration.set(duration);

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      duration: `${duration.toFixed(3)}s`,
      error: error.message,
    });
  }
});

// Prometheus metrics endpoint
router.get('/health/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

export default router;
