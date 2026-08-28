import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const typeOrmConfig = async (
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> => {
  const databaseType =
    configService.get<string>('DATABASE_TYPE') ?? 'postgres';

  const nodeEnv = configService.get<string>('NODE_ENV');

  const isSqlite = databaseType === 'sqlite';
  const isTestEnvironment = !configService.get<string>('DATABASE_TYPE') && nodeEnv === 'test';
  const useSqlite = isSqlite || isTestEnvironment;

  return {
    type: databaseType as any,

    host: useSqlite
      ? undefined
      : configService.get<string>('DATABASE_HOST') ??
        configService.get<string>('DB_HOST') ??
        'localhost',

    port: useSqlite
      ? undefined
      : configService.get<number>('DATABASE_PORT') ??
        configService.get<number>('DB_PORT') ??
        5432,

    username: useSqlite
      ? undefined
      : configService.get<string>('DATABASE_USERNAME') ??
        configService.get<string>('DB_USERNAME') ??
        'postgres',

    password: useSqlite
      ? undefined
      : configService.get<string>('DATABASE_PASSWORD') ??
        configService.get<string>('DB_PASSWORD') ??
        'postgres',

    database: useSqlite
      ? ':memory:'
      : configService.get<string>('DATABASE_NAME') ??
        configService.get<string>('DB_NAME') ??
        'uzima',

    // Auto-create schema for SQLite tests
    synchronize: useSqlite,

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
    ],

    migrations: [__dirname + '/migrations/*{.ts,.js}'],

    logging: true,
  };
};

