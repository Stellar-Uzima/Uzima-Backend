import mongoose from 'mongoose';
import redisClient from '../config/redis.js';
import { emailQueue } from '../queues/emailQueue.js';

class HealthCheckService {
  constructor() {
    this.startTime = Date.now();
  }

  checkDatabase() {
    const startTime = Date.now();
    const isConnected = mongoose.connection.readyState === 1;

    return {
      status: isConnected ? 'up' : 'down',
      latency: Date.now() - startTime,
      message: isConnected ? 'MongoDB connected' : `MongoDB disconnected (state: ${mongoose.connection.readyState})`,
    };
  }

  async checkRedis() {
    const startTime = Date.now();

    try {
      const isReady = redisClient?.isReady || redisClient?.isOpen;

      if (!isReady) {
        return {
          status: 'down',
          latency: Date.now() - startTime,
          message: 'Redis client not ready',
        };
      }

      await redisClient.ping();

      return {
        status: 'up',
        latency: Date.now() - startTime,
        message: 'Redis connected',
      };
    } catch (error) {
      return {
        status: 'down',
        latency: Date.now() - startTime,
        message: error.message || 'Redis connection failed',
      };
    }
  }

  async checkQueue() {
    const startTime = Date.now();

    try {
      if (!emailQueue?.queue) {
        return {
          status: 'down',
          latency: Date.now() - startTime,
          message: 'Queue not initialized',
        };
      }

      await emailQueue.queue.client.ping();

      return {
        status: 'up',
        latency: Date.now() - startTime,
        message: 'Job queue connected',
      };
    } catch (error) {
      return {
        status: 'down',
        latency: Date.now() - startTime,
        message: error.message || 'Queue connection failed',
      };
    }
  }

  checkProcess() {
    const mem = process.memoryUsage();

    return {
      status: 'up',
      uptime: Date.now() - this.startTime,
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      pid: process.pid,
    };
  }

  async getLiveness() {
    return {
      status: 'alive',
      message: 'Service is running',
      checks: { process: this.checkProcess() },
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const dbHealth = this.checkDatabase();
    const [redisHealth, queueHealth] = await Promise.all([
      this.checkRedis(),
      this.checkQueue(),
    ]);

    const allReady = 
      dbHealth.status === 'up' && 
      redisHealth.status === 'up' && 
      queueHealth.status === 'up';

    return {
      status: allReady ? 'ready' : 'not-ready',
      message: allReady ? 'All dependencies are healthy' : 'One or more dependencies unhealthy',
      checks: {
        database: dbHealth,
        redis: redisHealth,
        queue: queueHealth,
        process: this.checkProcess(),
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export default new HealthCheckService();
