import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferencesModule } from './preferences/preferences.module';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './services/notification.service';
import { NotificationsController } from './notifications.controller';
import { User } from '../../entities/user.entity';
import { EmailTemplateService } from '../../shared/notifications/services/email-template.service';
import { NotificationLog } from './notification-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationPreference, Notification, NotificationLog,
 User]),
    NotificationPreferencesModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationService, EmailTemplateService],
  exports: [NotificationPreferencesModule, NotificationService, EmailTemplateService],
})
export class NotificationsModule {}
