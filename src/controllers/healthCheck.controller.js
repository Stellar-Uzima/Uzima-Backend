import healthCheckService from '../services/healthCheck.js';
import { logger } from '../utils/logger.js';

const errorResponse = (statusCode, message) => ({
  status: statusCode === 500 ? 'unhealthy' : 'not-ready',
  message,
  timestamp: new Date().toISOString(),
});

const liveness = async (req, res) => {
  try {
    const health = await healthCheckService.getLiveness();
    res.status(200).json(health);
  } catch (error) {
    logger.error('Liveness probe failed', { error: error.message });
    res.status(500).json(errorResponse(500, 'Liveness check failed'));
  }
};

const readiness = async (req, res) => {
  try {
    const health = await healthCheckService.getReadiness();
    const statusCode = health.status === 'ready' ? 200 : 503;

    res.status(statusCode).json(health);

    if (statusCode !== 200) {
      logger.warn('Readiness probe: dependencies not ready', { health });
    }
  } catch (error) {
    logger.error('Readiness probe failed', { error: error.message });
    res.status(503).json(errorResponse(503, 'Readiness check failed'));
  }
};

export default { liveness, readiness };
