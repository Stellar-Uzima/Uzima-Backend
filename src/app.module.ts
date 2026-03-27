import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { SanitizeMiddleware } from './common/middleware/sanitize.middleware';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { OtpModule } from './otp/otp.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StellarModule } from './stellar/stellar.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { CouponModule } from './coupons/coupon.module';
import { TasksModule } from './tasks/tasks.module';
import { TaskAssignmentModule } from './tasks/assignment/task-assignment.module';
import { RewardModule } from './rewards/reward.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    // ── Infrastructure (must be first) ───────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: config.get<string>('REDIS_URL'),
      }),
    }),
    DatabaseModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60'),
          limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '100'),
        },
      ],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    // ── Feature modules ───────────────────────────────────
    QueueModule,
    OtpModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    StellarModule,
    AdminModule,
    AuditModule,
    CouponModule,
    TasksModule,
    TaskAssignmentModule,
    RewardModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SanitizeMiddleware).forRoutes('*');
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
