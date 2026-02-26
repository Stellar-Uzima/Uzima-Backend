import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const typeOrmConfig = async (
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST') ?? 'localhost',
  port: configService.get<number>('DB_PORT') ?? 5432,
  username: configService.get<string>('DB_USERNAME') ?? 'postgres',
  password: configService.get<string>('DB_PASSWORD') ?? 'postgres',
  database: configService.get<string>('DB_NAME') ?? 'uzima',
  entities: [
    __dirname + '/../entities/*.entity{.ts,.js}',
    __dirname + '/../auth/entities/*.entity{.ts,.js}',
    __dirname + '/../users/entities/*.entity{.ts,.js}',
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
  synchronize: false,
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  logging: true,
});
