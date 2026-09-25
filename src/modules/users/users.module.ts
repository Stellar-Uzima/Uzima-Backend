import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';
import { UserSearchService } from './services/user-search.service';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UserPreferences } from '../../database/entities/user-preferences.entity';
import { UserActivity } from '../../database/entities/user-activity.entity';
import { PhoneVerificationService } from './services/phone-verification.service';
import { SmsService } from '../../shared/sms/sms.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { User } from '../../entities/user.entity';
import { Coupon } from '../../entities/coupon.entity';
import { HealthTask } from '../../entities/health-task.entity';
import { UsersController } from './users.controller';
import { DataExportDownloadController } from './controllers/data-export-download.controller';
import { UsersService } from './users.service';
import { QueueModule } from '../../queue/queue.module';
import { ActivityTrackerService } from './services/activity-tracker.service';
import { AvatarService } from './services/avatar.service';
import { ActivityFeedService } from './services/activity-feed.service';
import { UserTimelineService } from './services/user-timeline.service';
import { DataExportService } from './services/data-export.service';
import { DataExportProcessor } from './processors/data-export.processor';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { ReferralRecord } from '../../referral/entities/referral-record.entity';
import { QueueService } from '../../shared/queue/queue.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AuditModule } from '../../audit/audit.module';
import { StorageService } from '../../storage/storage.service';
import { StellarModule } from '../../stellar/stellar.module';
import { CurrencyModule } from '../../shared/currency/currency.module';
import { CurrencyService } from '../../shared/currency/currency.service';
import { ActivityFeedService } from './services/activity-feed.service';
import { StorageService } from '../../shared/storage/storage.service';
import { Coupon } from '../../entities/coupon.entity';
import { HealthTask } from '../../entities/health-task.entity';
import { AuditModule } from '../../audit/audit.module';

@Module({
  controllers: [UsersController, SettingsController, DataExportDownloadController],
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserStatusLog,
      UserPreferences,
      UserActivity,
      TaskCompletion,
      RewardTransaction,
      Notification,
      ReferralRecord,
      Coupon,
      HealthTask,
    ]),
    CacheModule.register({
      ttl: 300,
    }),
    QueueModule,
    NotificationsModule,
    AuditModule,
    StellarModule,
    CurrencyModule,
  ],
  exports: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    ActivityTrackerService,
    AvatarService,
    ActivityFeedService,
    UserTimelineService,
    DataExportService,
    CurrencyService,
  ],
  providers: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    SmsService,
    ActivityTrackerService,
    ActivityFeedService,
    AvatarService,
    ActivityFeedService,
    UserTimelineService,
    DataExportService,
    DataExportProcessor,
    QueueService,
    StorageService,
    CurrencyService,
  ],
})
export class UsersModule {}
