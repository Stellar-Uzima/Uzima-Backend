import { registerAs } from '@nestjs/config';

const ORIGIN_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*/i;

export function isValidCorsOrigin(origin: string): boolean {
  if (!origin || origin.includes('*')) {
    return false;
  }
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && ORIGIN_PATTERN.test(origin);
  } catch {
    return false;
  }
}

export function parseCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ORIGINS ?? env.CORS_ORIGIN ?? 'http://localhost:3000';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('At least one CORS origin must be configured');
  }

  const invalid = origins.filter((origin) => !isValidCorsOrigin(origin));
  if (invalid.length > 0) {
    throw new Error(`Invalid CORS origin(s): ${invalid.join(', ')}`);
  }

  return [...new Set(origins)];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ScheduledJobHealthConfig {
  enabled: boolean;
  checkIntervalMs: number;
  defaultMaxDelayMs: number;
  defaultMaxMissedRuns: number;
  alertOnMissedRun: boolean;
  alertOnRepeatedFailure: boolean;
}

export function parseScheduledJobHealthConfig(
  env: NodeJS.ProcessEnv = process.env,
): ScheduledJobHealthConfig {
  const toBool = (value: string | undefined, fallback: boolean) => {
    if (value === undefined) {
      return fallback;
    }
    return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
  };

  const toPositiveInt = (value: string | undefined, fallback: number) => {
    const parsed = value === undefined ? NaN : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };

  return {
    enabled: toBool(env.SCHEDULED_JOB_HEALTH_ENABLED, true),
    checkIntervalMs: toPositiveInt(env.SCHEDULED_JOB_HEALTH_CHECK_INTERVAL_MS, 60_000),
    defaultMaxDelayMs: toPositiveInt(env.SCHEDULED_JOB_DEFAULT_MAX_DELAY_MS, 5 * 60_000),
    defaultMaxMissedRuns: toPositiveInt(env.SCHEDULED_JOB_DEFAULT_MAX_MISSED_RUNS, 1),
    alertOnMissedRun: toBool(env.SCHEDULED_JOB_ALERT_ON_MISSED_RUN, true),
    alertOnRepeatedFailure: toBool(env.SCHEDULED_JOB_ALERT_ON_REPEATED_FAILURE, true),
  };
}

export default registerAs('app', () => {
  const corsOrigins = parseCorsOrigins(process.env);
  const scheduledJobHealth = parseScheduledJobHealthConfig(process.env);

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT ?? '3000', 10) || 3000,
    apiPrefix: process.env.API_PREFIX || 'api',
    name: 'Stellar Uzima Backend',
    version: '1.0.0',
    corsOrigin: corsOrigins[0],
    corsOrigins: corsOrigins,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiration: process.env.JWT_EXPIRATION || '7d',
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production',
    // External call resilience (issue #140)
    externalTimeoutMs: parsePositiveInt(process.env.EXTERNAL_REQUEST_TIMEOUT_MS, 10_000),
    circuitBreaker: {
      failureThreshold: parsePositiveInt(process.env.EXTERNAL_CIRCUIT_FAILURE_THRESHOLD ?? process.env.NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD, 5),
      resetTimeout: parsePositiveInt(process.env.EXTERNAL_CIRCUIT_RESET_MS ?? process.env.NOTIFICATION_CIRCUIT_RESET_MS, 30_000),
      timeoutMs: parsePositiveInt(process.env.EXTERNAL_REQUEST_TIMEOUT_MS, 10_000),
    },
    scheduledJobHealth,
  };
});