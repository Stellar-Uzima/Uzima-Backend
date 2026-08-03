import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nestjs/throttler-storage-redis';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import secretsConfig from './config/secrets';
import passwordConfig from './config/password.config';
import { redisConfig } from './config/redis.config';

// Modules
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { HealthTasksModule } from '@modules/health-tasks/health-tasks.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ConsultationsModule } from '@modules/consultations/consultations.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { AdminModule } from '@modules/admin/admin.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { GamificationModule } from './modules/gamification/gamification.module';
// 1. Import the new StorageModule
import { StorageModule } from './shared/storage/storage.module'; 
import { MetricsModule } from './shared/metrics/metrics.module';
import { UsageModule } from './modules/usage/usage.module';
import { MonitoringModule } from './shared/monitoring/monitoring.module'; 
import { CacheModule } from './shared/cache/cache.module';
import { CouponModule } from './coupons/coupon.module'; // <-- Added CouponModule import

// Database
import { DatabaseModule } from '@database/database.module';

// Common
import { LoggingModule } from '@common/interceptors/logging.module';
import { SigningModule } from './common/signing/signing.module';

// Shared
import { SearchModule } from './shared/search/search.module';
import { SchedulerModule } from './shared/scheduler/scheduler.module';
import { PushModule } from './shared/notifications/push.module';
import { AnalyticsModule } from './shared/analytics/analytics.module';
import { OtpModule } from './otp/otp.module';
import { AppCacheModule } from './shared/cache/cache.module';
import { RewardModule } from './rewards/reward.module';
import { ReferralModule } from './referral/referral.module';
import { HealthProfileModule } from './modules/health-profile/health-profile.module';
import { HealthModule } from './health/health.module';
import { NotificationCenterModule } from './modules/notification-center/notification-center.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [secretsConfig, passwordConfig],
    }),
    HealthModule,
    AppCacheModule,
    ThrottlerModule.forRootAsync({
      useFactory: (configService) => {
        const config = redisConfig(configService);
        return {
          // Use Redis storage for distributed rate limiting across multiple instances
          storage: new ThrottlerStorageRedisService({
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.db,
            tls: config.tls ? {} : undefined,
          }),
          throttlers: [
            {
              name: 'default',
              ttl: 60000, // 1 minute in milliseconds
              limit: 100, // 100 requests per minute per client IP
            },
            {
              name: 'otp',
              ttl: 3600000, // 1 hour in milliseconds
              limit: 3, // Only 3 OTP requests per hour to prevent abuse
            },
          ],
        };
      },
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    OtpModule,
    LoggingModule,
    // 2. Add it to the imports list
    StorageModule,
    CacheModule,
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
 feat/gamification-engine
    GamificationModule,

    RewardModule,
    ReferralModule,
    HealthProfileModule,
    CouponModule, // <-- Registered CouponModule in active application imports tree
    NotificationCenterModule,
 main
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
 feat/gamification-engine
export class AppModule {}
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
 main