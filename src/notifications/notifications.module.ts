import { Module } from '@nestjs/common';
import { NotificationPreferencesModule } from './preferences/preferences.module';

@Module({
  imports: [NotificationPreferencesModule],
  exports: [NotificationPreferencesModule],
})
export class NotificationsModule {}
