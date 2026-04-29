import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { registerAs } from '@nestjs/config';

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
    logging: process.env.NODE_ENV === 'development',
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
      duration: parseInt(process.env.CACHE_DURATION || '300000', 10), // 5 minutes default
    },
  }),
);

export const cacheConfig = registerAs('cache', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL || '3600', 10), // 1 hour default
  maxRetries: parseInt(process.env.CACHE_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.CACHE_RETRY_DELAY || '1000', 10),
}));
