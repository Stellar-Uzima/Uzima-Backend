import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferencesModule } from './preferences/preferences.module';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './services/notification.service';
import { NotificationsController } from './notifications.controller';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationPreference, Notification, User]),
    NotificationPreferencesModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationPreferencesModule, NotificationService],
})
export class NotificationsModule {}
