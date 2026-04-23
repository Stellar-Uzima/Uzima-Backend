import { Module } from '@nestjs/common';
import { PhoneVerificationService } from './services/phone-verification.service';
import { SmsService } from '../../shared/sms/sms.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserSearchService } from './services/user-search.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  exports: [UsersService, UserSearchService, PhoneVerificationService],
  providers: [UsersService, UserSearchService, PhoneVerificationService, SmsService],
})
export class UsersModule { }
