import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferencesModule } from './preferences/preferences.module';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationPreference]),
    NotificationPreferencesModule,
  ],
  providers: [NotificationService],
  exports: [NotificationPreferencesModule, NotificationService],
})
export class NotificationsModule {}
