import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Modules
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { HealthTasksModule } from '@modules/health-tasks/health-tasks.module';
import { WalletModule } from '@modules/wallet/wallet.module';
import { ConsultationsModule } from '@modules/consultations/consultations.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';

// Database
import { DatabaseModule } from '@database/database.module';

// Common
import { LoggingModule } from '@common/interceptors/logging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    LoggingModule,
    AuthModule,
    UsersModule,
    HealthTasksModule,
    WalletModule,
    ConsultationsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
