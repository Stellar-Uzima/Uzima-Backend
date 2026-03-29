import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferencesModule } from './preferences/preferences.module';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './services/notification.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationPreference, Notification]),
    NotificationPreferencesModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationPreferencesModule, NotificationService],
})
export class NotificationsModule {}
