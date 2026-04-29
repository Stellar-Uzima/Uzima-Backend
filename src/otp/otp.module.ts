import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtpService } from './otp.service';

@Module({
  imports: [ConfigModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
