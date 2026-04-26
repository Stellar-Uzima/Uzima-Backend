import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionService } from './services/transaction.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'stellar_uzima'),
        entities: [__dirname + '/../**/entities/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        // Never auto-sync in production — rely solely on migrations
        synchronize:
          configService.get<string>('NODE_ENV') !== 'production' &&
          configService.get<boolean>('DB_SYNCHRONIZE', false),
        migrationsRun: configService.get<string>('NODE_ENV') === 'production',
        logging: configService.get<boolean>('DB_LOGGING', false),
      }),
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class DatabaseModule {}
