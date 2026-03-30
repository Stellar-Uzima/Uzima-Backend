import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const typeOrmConfig = async (
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> => {
  const isSqlite =
    process.env.DATABASE_TYPE === 'sqlite' ||
    (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test');

  const baseOptions: TypeOrmModuleOptions = {
    type: (process.env.DATABASE_TYPE as any) ?? (process.env.NODE_ENV === 'test' ? 'sqlite' : 'postgres'),
    host: isSqlite
      ? undefined
      : configService.get<string>('DATABASE_HOST') ??
        configService.get<string>('DB_HOST') ??
        'localhost',
    port: isSqlite
      ? undefined
      : configService.get<number>('DATABASE_PORT') ??
        configService.get<number>('DB_PORT') ??
        5432,
    username: isSqlite
      ? undefined
      : configService.get<string>('DATABASE_USERNAME') ??
        configService.get<string>('DB_USERNAME') ??
        'postgres',
    password: isSqlite
      ? undefined
      : configService.get<string>('DATABASE_PASSWORD') ??
        configService.get<string>('DB_PASSWORD') ??
        'postgres',
    database: isSqlite
      ? ':memory:'
      : configService.get<string>('DATABASE_NAME') ??
        configService.get<string>('DB_NAME') ??
        'uzima',
    synchronize: isSqlite,
    entities: [
      __dirname + '/../entities/*.entity{.ts,.js}',
      __dirname + '/../auth/entities/*.entity{.ts,.js}',
      __dirname + '/../tasks/entities/*.entity{.ts,.js}',
      __dirname + '/../task-completion/entities/*.entity{.ts,.js}',
      __dirname + '/../coupons/entities/*.entity{.ts,.js}',
      __dirname + '/../rewards/entities/*.entity{.ts,.js}',
      __dirname + '/../referral/entities/*.entity{.ts,.js}',
      __dirname + '/../notifications/entities/*.entity{.ts,.js}',
      __dirname + '/../audit/entities/*.entity{.ts,.js}',
      __dirname + '/../stellar/entities/*.entity{.ts,.js}',
      __dirname + '/../admin/entities/*.entity{.ts,.js}',
    ],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    logging: true,
  };

  // Connection pool configuration for non-SQLite databases
  if (!isSqlite) {
    const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? '', 10);
    const poolMin = parseInt(process.env.DATABASE_POOL_MIN ?? '', 10);
    const poolMax = parseInt(process.env.DATABASE_POOL_MAX ?? '', 10);
    const connectTimeout = parseInt(process.env.DATABASE_CONNECTION_TIMEOUT ?? '', 10);
    const acquireTimeout = parseInt(process.env.DATABASE_ACQUIRE_TIMEOUT ?? '', 10);

    baseOptions.extra = {};

    if (!isNaN(poolSize) && poolSize > 0) {
      baseOptions.extra.max = poolSize;
      baseOptions.extra.min = Math.max(2, Math.floor(poolSize * 0.2));
    } else {
      if (!isNaN(poolMin) && poolMin >= 0) {
        baseOptions.extra.min = poolMin;
      }
      if (!isNaN(poolMax) && poolMax > 0) {
        baseOptions.extra.max = poolMax;
      }
    }

    if (!isNaN(connectTimeout) && connectTimeout > 0) {
      baseOptions.extra.connectionTimeout = connectTimeout;
    }

    if (!isNaN(acquireTimeout) && acquireTimeout > 0) {
      baseOptions.extra.acquireTimeout = acquireTimeout;
    }

    // Default pool settings by environment if not specified
    const env = process.env.NODE_ENV ?? 'development';
    if (env === 'production' && !baseOptions.extra.max) {
      baseOptions.extra.max = 20;
      baseOptions.extra.min = 5;
    } else if (env === 'staging' && !baseOptions.extra.max) {
      baseOptions.extra.max = 10;
      baseOptions.extra.min = 2;
    }
  }

  return baseOptions;
};
