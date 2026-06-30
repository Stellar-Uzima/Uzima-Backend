import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';

@Module({
  imports: [ConfigModule],
  controllers: [OtpController],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
