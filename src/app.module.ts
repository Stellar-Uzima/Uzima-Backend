import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import secretsConfig from './config/secrets';

// Modules
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { HealthTasksModule } from '@modules/health-tasks/health-tasks.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ConsultationsModule } from '@modules/consultations/consultations.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { AdminModule } from '@modules/admin/admin.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { StorageModule } from './shared/storage/storage.module';
import { MetricsModule } from './shared/metrics/metrics.module';
import { UsageModule } from './modules/usage/usage.module';
import { MonitoringModule } from './shared/monitoring/monitoring.module';

// Database
import { DatabaseModule } from '@database/database.module';

// Common
import { LoggingModule } from '@common/interceptors/logging.module';
import { SigningModule } from './common/signing/signing.module';

// Middleware
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RequestContextService } from './common/middleware/request-context.service';

// Shared
import { SearchModule } from './shared/search/search.module';
import { SchedulerModule } from './shared/scheduler/scheduler.module';
import { PushModule } from './shared/notifications/push.module';
import { AnalyticsModule } from './shared/analytics/analytics.module';
import { OtpModule } from './otp/otp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [secretsConfig],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'otp',
        ttl: 3600000,
        limit: 3,
      },
    ]),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    OtpModule,
    LoggingModule,
    StorageModule,
    MetricsModule,
    AnalyticsModule,
    UsageModule,
    MonitoringModule,
    SigningModule,
    SearchModule,
    SchedulerModule,
    PushModule,
    AuthModule,
    UsersModule,
    HealthTasksModule,
    WalletModule,
    ConsultationsModule,
    NotificationsModule,
    AdminModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestContextService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Issue #667 — apply RequestIdMiddleware globally so every request gets a
   * unique X-Request-ID header and a populated AsyncLocalStorage context.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}