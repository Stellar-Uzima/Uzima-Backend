import 'dotenv/config';
import { DataSource } from 'typeorm';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? `${fallback}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * TypeORM DataSource configuration for database migrations and CLI.
 *
 * Production expectations:
 * - keep synchronize disabled and rely on migrations only
 * - disable verbose query logging in production; enable it only for debugging
 * - use a bounded connection pool with conservative timeouts to protect the database
 */
const AppDataSource = new DataSource({
  type: 'postgres', // Database type
  host: process.env.DATABASE_HOST || 'localhost', // Database host
  port: parseInt(process.env.DATABASE_PORT || '5432'), // Database port
  username: process.env.DATABASE_USERNAME || 'postgres', // Database username
  password: process.env.DATABASE_PASSWORD || 'postgres', // Database password
  database: process.env.DATABASE_NAME || 'uzima', // Database name
  entities: [process.cwd() + '/src/**/*.entity.{ts,js}'], // Auto-discover all entities
  migrations: ['src/migrations/*{.ts,.js}'], // Migration files for CLI
  migrationsTableName: 'migrations',
  synchronize: false, // Never use true in production
  logging: process.env.NODE_ENV === 'production' ? false : process.env.DB_LOGGING === 'true' ? 'all' : ['error'],
  maxQueryExecutionTime: parsePositiveInt(process.env.SLOW_QUERY_THRESHOLD_MS, 1000),
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? {
          rejectUnauthorized: false, // Accept self-signed certificates in development
        }
      : false,
  extra: {
    max: parsePositiveInt(process.env.DB_POOL_MAX, 20), // Maximum number of pooled connections
    min: parsePositiveInt(process.env.DB_POOL_MIN, 5), // Minimum number of pooled connections
    idleTimeoutMillis: parsePositiveInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000), // Timeout for idle connections
    connectionTimeoutMillis: parsePositiveInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 2000), // Timeout for connection requests
  },
});

// Export default for TypeORM CLI compatibility
export default AppDataSource;
