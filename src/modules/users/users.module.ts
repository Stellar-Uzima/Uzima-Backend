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
import { UsersService } from './users.service';

@Module({ 
  controllers: [UsersController, SettingsController],  
  imports: [
    TypeOrmModule.forFeature([User, UserStatusLog, UserPreferences]),
    CacheModule.register({
      ttl: 300, // 5 minutes default TTL
    }),
  ], 
  exports: [UsersService, UserSearchService, PhoneVerificationService, PreferencesService],
  providers: [UsersService, UserSearchService, PhoneVerificationService, SmsService, PreferencesService],
})
export class UsersModule { }
