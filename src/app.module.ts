import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { OtpModule } from './otp/otp.module';
import { UsersModule } from './users/users.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { DatabaseModule } from './database/database.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StellarModule } from './stellar/stellar.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { CouponModule } from './coupons/coupon.module';
import { TasksModule } from './tasks/tasks.module';
import { RewardModule } from './rewards/reward.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60'),
          limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '100'),
        },
      ],
    }),
    EventEmitterModule.forRoot(),
    QueueModule,
    OtpModule,
    AuthModule,
    UsersModule,
    DatabaseModule,
    StellarModule,
    AdminModule,
    AuditModule,
    CouponModule,
    TasksModule,
    RewardModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
