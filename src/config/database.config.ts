import { Logger } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { registerAs } from '@nestjs/config';
import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { MetricsService } from '../shared/metrics/metrics.service';

interface DatabasePoolConfig {
  max: number;
  min: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? `${fallback}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSlowQueryThresholdMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = parseInt(env.SLOW_QUERY_THRESHOLD_MS ?? '1000', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1000;
  }
  return parsed;
}

export class SlowQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('TypeORM');

  constructor(
    private readonly thresholdMs: number,
    private readonly production: boolean,
    private readonly metrics?: MetricsService,
  ) {}

  logQuerySlow(time: number, query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
    const operation = getQueryOperation(query);
    this.metrics?.recordDbQueryDuration(operation, time / 1000);
    if (time < this.thresholdMs) {
      return;
    }
    this.metrics?.incrementSlowDbQueries(operation);
    this.logger.warn(`Slow database query: operation=${operation} duration_ms=${Math.round(time)} threshold_ms=${this.thresholdMs}`);
  }

  logQuery(query: string): void {
    this.metrics?.incrementDbQueries(getQueryOperation(query));
  }

  logQueryError(error: string | Error, query: string, _parameters?: unknown[]) {
    const errorType = error instanceof Error ? error.name : 'QueryError';
    this.logger.error(`Database query failed: operation=${getQueryOperation(query)} error_type=${errorType}`);
  }

  logSchemaBuild(message: string) {
    if (!this.production) {
      this.logger.log(message);
    }
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown) {
    if (this.production) {
      return;
    }
    this.logger[level === 'log' ? 'log' : level](String(message));
  }
}

export function getDatabasePoolConfig(env: NodeJS.ProcessEnv = process.env): DatabasePoolConfig {
  return {
    max: parsePositiveInt(env.DB_POOL_MAX, 20),
    min: parsePositiveInt(env.DB_POOL_MIN, 5),
    idleTimeoutMillis: parsePositiveInt(env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: parsePositiveInt(env.DB_POOL_CONNECTION_TIMEOUT_MS, 2000),
  };
}

export function buildDatabaseTypeOrmOptions(
  env: NodeJS.ProcessEnv = process.env,
  metrics?: MetricsService,
): Pick<TypeOrmModuleOptions, 'logging' | 'maxQueryExecutionTime' | 'logger' | 'extra'> {
  const isProduction = env.NODE_ENV === 'production';
  const thresholdMs = getSlowQueryThresholdMs(env);
  const verboseLogging = env.DB_LOGGING === 'true';

  /**
   * Production defaults:
   * - keep query logging off in production and only report slow queries
   * - use a small, stable pool with bounded idle and connect timeouts
   * - keep the threshold at 1000ms unless explicitly overridden
   */
  return {
    maxQueryExecutionTime: thresholdMs,
    // Keep TypeORM's query callback enabled so it can count operations. The
    // custom logger never emits the SQL text or its bound parameters.
    logging: isProduction ? ['query', 'error'] : verboseLogging,
    logger: new SlowQueryLogger(thresholdMs, isProduction, metrics),
    extra: getDatabasePoolConfig(env),
  };
}

export function getQueryOperation(query: string): string {
  const operation = /^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.exec(query)?.[1]?.toUpperCase();
  return operation ?? 'OTHER';
}

export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD,
    database: process.env.DB_DATABASE || 'uzima_dev',
    entities: ['dist/**/*.entity{.ts,.js}'],
    migrations: ['dist/database/migrations/*{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    dropSchema: false,
    migrationsRun: process.env.NODE_ENV === 'production',
    cache: {
      type: 'redis',
      options: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      },
      duration: parseInt(process.env.CACHE_DURATION || '300000', 10),
    },
    ...buildDatabaseTypeOrmOptions(process.env),
  }),
);

export const cacheConfig = registerAs('cache', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL || '3600', 10),
  maxRetries: parseInt(process.env.CACHE_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.CACHE_RETRY_DELAY || '1000', 10),
}));
