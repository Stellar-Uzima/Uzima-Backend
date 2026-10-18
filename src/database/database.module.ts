import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseTypeOrmOptions } from '../config/database.config';
import { TransactionService } from './services/transaction.service';
import { MetricsModule } from '../shared/metrics/metrics.module';
import { MetricsService } from '../shared/metrics/metrics.service';

@Module({
  imports: [
    MetricsModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService, MetricsService],
      useFactory: (configService: ConfigService, metricsService: MetricsService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD') ?? configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DB_NAME', 'stellar_uzima'),
        entities: [__dirname + '/../**/entities/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        // Never auto-sync in production — rely solely on migrations
        synchronize:
          configService.get<string>('NODE_ENV') !== 'production' &&
          configService.get<boolean>('DB_SYNCHRONIZE', false),
        migrationsRun: configService.get<string>('NODE_ENV') === 'production',
        ...buildDatabaseTypeOrmOptions({
          NODE_ENV: configService.get<string>('NODE_ENV', 'development'),
          DB_LOGGING: configService.get<string>('DB_LOGGING', 'false'),
          SLOW_QUERY_THRESHOLD_MS: configService.get<string>(
            'SLOW_QUERY_THRESHOLD_MS',
            '1000',
          ),
        }, metricsService),
      }),
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class DatabaseModule {}
