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
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { QueueModule } from '../../queue/queue.module';
import { ActivityTrackerService } from './services/activity-tracker.service';
import { ActivityFeedService } from './services/activity-feed.service';
import { AvatarService } from './services/avatar.service';
import { StorageService } from '../../storage/storage.service';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { Coupon } from '../../coupons/entities/coupon.entity';

@Module({
  controllers: [UsersController, SettingsController],
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserStatusLog,
      UserPreferences,
      UserActivity,
      TaskCompletion,
      RewardTransaction,
      Coupon,
    ]),
    CacheModule.register({
      ttl: 300,
    }),
    QueueModule,
  ],
  exports: [
    UsersService,
    UserSearchService,
    PhoneVerificationService,
    ActivityTrackerService,
    ActivityFeedService,
    AvatarService,
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
  ],
})
export class UsersModule {}
