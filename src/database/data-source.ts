import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource configuration for database seeding and migrations.
 * This file is used by TypeORM CLI and seed scripts.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.DATABASE_PORT || '5432'),
  username: process.env.DB_USERNAME || process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DB_NAME || process.env.DATABASE_NAME || 'uzima',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  entities: [
    __dirname + '/../**/*.entity{.ts,.js}',
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
