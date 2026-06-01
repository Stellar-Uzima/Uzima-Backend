import { Logger } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { registerAs } from '@nestjs/config';
import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';

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
  ) {}

  logQuerySlow(time: number, query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
    if (time < this.thresholdMs) {
      return;
    }
    this.logger.warn(
      `Slow query (${time}ms): ${query}${parameters?.length ? ` -- params: ${JSON.stringify(parameters)}` : ''}`,
    );
  }

  logQuery(): void {
    if (!this.production) {
      return;
    }
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
    this.logger.error(
      `Query error: ${error instanceof Error ? error.message : error} | ${query}${parameters?.length ? ` -- params: ${JSON.stringify(parameters)}` : ''}`,
    );
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

export function buildDatabaseTypeOrmOptions(
  env: NodeJS.ProcessEnv = process.env,
): Pick<TypeOrmModuleOptions, 'logging' | 'maxQueryExecutionTime' | 'logger'> {
  const isProduction = env.NODE_ENV === 'production';
  const thresholdMs = getSlowQueryThresholdMs(env);
  const verboseLogging = env.DB_LOGGING === 'true';

  return {
    maxQueryExecutionTime: thresholdMs,
    logging: isProduction ? false : verboseLogging,
    logger: new SlowQueryLogger(thresholdMs, isProduction),
  };
}

export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
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
