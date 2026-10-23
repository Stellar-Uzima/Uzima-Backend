import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@typeorm/nestjs-typeorm';
import { NotificationPreferences } from './entities/notification-preferences.entity';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferencesController } from './notification-preferences.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreferences])],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService],
  exports: [NotificationPreferencesService],
})
export class NotificationPreferencesModule {}
