import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';

import { SettingsController } from './controllers/settings.controller';
import { UsersController } from './users.controller';
import { DataExportDownloadController } from './controllers/data-export-download.controller';

import { UsersService } from './users.service';
import { UserSearchService } from './services/user-search.service';
import { PhoneVerificationService } from './services/phone-verification.service';
import { ActivityTrackerService } from './services/activity-tracker.service';
import { ActivityFeedService } from './services/activity-feed.service';
import { AvatarService } from './services/avatar.service';
import { DataExportService } from './services/data-export.service';
import { StorageService } from '../../shared/storage/storage.service';
import { DataExportProcessor } from './processors/data-export.processor';
import { SmsService } from '../../shared/sms/sms.service';
import { QueueService } from '../../shared/queue/queue.service';

import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UserPreferences } from '../../database/entities/user-preferences.entity';
import { UserActivity } from '../../database/entities/user-activity.entity';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { ReferralRecord } from '../../referral/entities/referral-record.entity';
import { Coupon } from '../../coupons/entities/coupon.entity';
import { HealthTask } from '../../tasks/entities/health-task.entity';

import { QueueModule } from '../../queue/queue.module';
import { NotificationsModule } from '../../notifications/notifications.module';

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
    CacheModule.register({ ttl: 300 }),
    QueueModule,
    NotificationsModule,
  ],
  providers: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    SmsService,
    ActivityTrackerService,
    ActivityFeedService,
    AvatarService,
    StorageService,
    DataExportService,
    DataExportProcessor,
    QueueService,
  ],
  exports: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    ActivityTrackerService,
    AvatarService,
    DataExportService,
  ],
})
export class UsersModule {}