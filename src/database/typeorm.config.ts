import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const typeOrmConfig = async (
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> => ({
  type: (process.env.DATABASE_TYPE as any) ?? (process.env.NODE_ENV === 'test' ? 'sqlite' : 'postgres'),
  host: (process.env.DATABASE_TYPE === 'sqlite' || (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test')) ? undefined : (configService.get<string>('DATABASE_HOST') ?? configService.get<string>('DB_HOST') ?? 'localhost'),
  port: (process.env.DATABASE_TYPE === 'sqlite' || (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test')) ? undefined : (configService.get<number>('DATABASE_PORT') ?? configService.get<number>('DB_PORT') ?? 5432),
  username: (process.env.DATABASE_TYPE === 'sqlite' || (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test')) ? undefined : (configService.get<string>('DATABASE_USERNAME') ?? configService.get<string>('DB_USERNAME') ?? 'postgres'),
  password: (process.env.DATABASE_TYPE === 'sqlite' || (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test')) ? undefined : (configService.get<string>('DATABASE_PASSWORD') ?? configService.get<string>('DB_PASSWORD') ?? 'postgres'),
  database: (process.env.DATABASE_TYPE === 'sqlite' || (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test')) ? ':memory:' : (configService.get<string>('DATABASE_NAME') ?? configService.get<string>('DB_NAME') ?? 'uzima'),
  synchronize: (process.env.DATABASE_TYPE === 'sqlite' || (!process.env.DATABASE_TYPE && process.env.NODE_ENV === 'test')), // Auto-create schema for SQLite tests
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
});
