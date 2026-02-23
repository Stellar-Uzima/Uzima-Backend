import { DataSource } from 'typeorm';

/**
 * TypeORM DataSource configuration for database migrations and CLI.
 *
 * type: Database type (e.g., 'postgres')
 * host: Database host address
 * port: Database port
 * username: Database username
 * password: Database password
 * database: Database name
 * entities: Array of entity classes (add all entities here)
 * migrations: Array of migration files
 * synchronize: Auto sync entities (disable in production)
 * logging: Enable query logging
 * ssl: SSL config for secure connections
 * extra: Pool config for connection management
 */
const AppDataSource = new DataSource({
  type: 'postgres', // Database type
  host: process.env.DATABASE_HOST || 'localhost', // Database host
  port: parseInt(process.env.DATABASE_PORT || '5432'), // Database port
  username: process.env.DATABASE_USERNAME || 'postgres', // Database username
  password: process.env.DATABASE_PASSWORD || 'postgres', // Database password
  database: process.env.DATABASE_NAME || 'uzima', // Database name
  entities: ['src/entities/**/*.entity{.ts,.js}'], // Auto-load all entities
  migrations: ['src/migrations/**/*{.ts,.js}'], // Migration files
  migrationsTableName: 'migrations',
  synchronize: false, // Never use true in production
  logging: process.env.NODE_ENV === 'development' ? 'all' : ['error'], // Enable logging for debugging
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? {
          rejectUnauthorized: false, // Accept self-signed certificates in development
        }
      : false,
  extra: {
    max: 20, // Connection pool settings
    min: 5,
    idleTimeoutMillis: 30000, // Timeout for idle connections
    connectionTimeoutMillis: 2000, // Timeout for connection requests
  },
});

// Export default for TypeORM CLI compatibility
export default AppDataSource;
