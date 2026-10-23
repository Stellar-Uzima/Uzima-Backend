import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import secretsConfig from './config/secrets';
import passwordConfig from './config/password.config';
import jwtConfig from './config/jwt.config';
import notificationRetryPolicyConfig from './config/notification-retry-policy.config';

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
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { LoggingModule as SharedLoggingModule } from './shared/logging/logging.module';
import { SigningModule } from './common/signing/signing.module';

// Shared
import { SearchModule } from './shared/search/search.module';
import { SchedulerModule } from './shared/scheduler/scheduler.module';
import { AnalyticsModule } from './shared/analytics/analytics.module';
import { OtpModule } from './otp/otp.module';
import { AppCacheModule } from './shared/cache/cache.module';
import { RewardModule } from './rewards/reward.module';
import { ReferralModule } from './referral/referral.module';
import { HealthProfileModule } from './modules/health-profile/health-profile.module';
import { HealthModule } from './health/health.module';
import { CurrencyModule } from './shared/currency/currency.module';
import { WebhookModule } from './modules/webhooks/webhook.module';
import { SupportModule } from './modules/support/support.module';
import { BackfillModule } from './modules/backfill/backfill.module';
import { RetentionModule } from './modules/retention/retention.module';

// Reliability & data quality (implemented against #1368 and #1367)
import { DeliveryReliabilityModule } from './modules/notification-center/delivery-reliability.module';
import { DataQualityModule } from './modules/data-quality/data-quality.module';

// User-facing schedules & records (implemented against #1371 and #1372)
import { NotificationDigestModule } from './modules/notification-digest/notification-digest.module';
import { UserConsentModule } from './modules/user-consent/user-consent.module';

// Abuse protection & third-party resilience (implemented against #1373 and #1375)
import { AntiAbuseModule } from './modules/anti-abuse/anti-abuse.module';
import { ResilienceModule } from './shared/resilience/resilience.module';

// UX health & first-run experience (implemented against #1377 and #1378)
import { UxMonitoringModule } from './modules/ux-monitoring/ux-monitoring.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';

// Notification preferences (implemented against Issue 091)
import { NotificationPreferencesModule } from './modules/notification-preferences/notification-preferences.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [secretsConfig, passwordConfig, jwtConfig, notificationRetryPolicyConfig],
      validationSchema: Joi.object({
        JWT_SECRET: Joi.string().min(32).invalid('your_jwt_secret_key_here_min_32_chars').optional(),
        JWT_REFRESH_SECRET: Joi.string().min(32).invalid('your_refresh_secret_key_here_min_32_chars').optional(),
        SECRETS_VAULT_KEY: Joi.string().min(32).optional(),
        DATABASE_PASSWORD: Joi.string().optional(),
        DB_PASSWORD: Joi.string().invalid('postgres', 'password').optional(),
        REDIS_PASSWORD: Joi.string().optional(),
        TWILIO_AUTH_TOKEN: Joi.string().optional(),
        STELLAR_TREASURY_SECRET_KEY: Joi.string().optional(),
        STELLAR_FUNDING_SECRET: Joi.string().invalid('your_stellar_account_secret_key').optional(),
        STELLAR_NETWORK: Joi.string().valid('testnet', 'public', 'mainnet').optional(),
        STELLAR_HORIZON_URL: Joi.string().uri({ scheme: ['https', 'http'] }).optional(),
        STELLAR_TREASURY_PUBLIC_KEY: Joi.string().optional(),
        STELLAR_FUNDING_PUBLIC_KEY: Joi.string().optional(),
        STELLAR_SIGNING_ENABLED: Joi.string().valid('true', 'false').optional(),
        STELLAR_FUNDING_SECRET_KEY: Joi.string().optional(),
        SLOW_QUERY_THRESHOLD_MS: Joi.number().integer().positive().optional(),
        SLOW_REQUEST_THRESHOLD_MS: Joi.number().integer().positive().optional(),
      }).unknown(true),
    }),
    HealthModule,
    AppCacheModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        return {
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
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    OtpModule,
    LoggingModule,
    SharedLoggingModule,
    IdempotencyModule,
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
    AuthModule,
    UsersModule,
    HealthTasksModule,
    WalletModule,
    ConsultationsModule,
    NotificationsModule,
    AdminModule,
    ReportsModule,
    GamificationModule,

    RewardModule,
    ReferralModule,
    HealthProfileModule,
    CouponModule, // <-- Registered CouponModule in active application imports tree

    UxMonitoringModule,
    OnboardingModule,
    AntiAbuseModule,
    ResilienceModule,
    NotificationDigestModule,
    UserConsentModule,
    DeliveryReliabilityModule,
    DataQualityModule,
    CurrencyModule,
    WebhookModule,
    SupportModule,
    BackfillModule,
    RetentionModule,
    NotificationPreferencesModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
