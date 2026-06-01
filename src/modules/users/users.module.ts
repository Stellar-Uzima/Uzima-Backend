import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';
import { UserSearchService } from './services/user-search.service';
import { PreferencesService } from './services/preferences.service';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UserPreferences } from '../../database/entities/user-preferences.entity';
import { PhoneVerificationService } from './services/phone-verification.service';
import { SmsService } from '../../shared/sms/sms.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { User } from '../../entities/user.entity';
import { UsersController } from './users.controller';
import { DataExportDownloadController } from './controllers/data-export-download.controller';
import { UsersService } from './users.service';
import { QueueModule } from '../../queue/queue.module';
import { UserActivity } from '../../database/entities/user-activity.entity';
import { ActivityTrackerService } from './services/activity-tracker.service';
import { AvatarService } from './services/avatar.service';
import { DataExportService } from './services/data-export.service';
import { DataExportProcessor } from './processors/data-export.processor';
import { TaskCompletion } from '../../database/entities/task-completion.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { ReferralRecord } from '../../referral/entities/referral-record.entity';
import { QueueService } from '../../shared/queue/queue.service';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  controllers: [
    UsersController,
    SettingsController,
    DataExportDownloadController,
  ],
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
    ]),
    CacheModule.register({
      ttl: 300,
    }),
    QueueModule,
    NotificationsModule,
  ],
  exports: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    ActivityTrackerService,
    AvatarService,
    DataExportService,
  ],
  providers: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    SmsService,
    ActivityTrackerService,
    AvatarService,
    DataExportService,
    DataExportProcessor,
    QueueService,
  ],
})
export class UsersModule {}
