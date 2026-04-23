import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { SmsService } from '../../shared/sms/sms.service';
import { UsersController } from './users.controller';
import { PhoneVerificationService } from './services/phone-verification.service';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, PhoneVerificationService, SmsService],
  exports: [UsersService, PhoneVerificationService],
})
export class UsersModule {}
