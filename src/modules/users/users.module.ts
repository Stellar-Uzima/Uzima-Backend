import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';  
import { UserSearchService } from './services/user-search.service';
import { UserStatusLog } from '../../entities/user-status-log.entity';
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
    TypeOrmModule.forFeature([User, UserStatusLog]),
    CacheModule.register({
      ttl: 300, // 5 minutes default TTL
    }),
  ], 
  exports: [UsersService, UserSearchService, PhoneVerificationService],
  providers: [UsersService, UserSearchService, PhoneVerificationService, SmsService],
})
export class UsersModule { }
