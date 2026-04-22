import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '@modules/users/users.module';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { EmailVerificationService } from './services/email-verification.service';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([EmailVerification]),
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION', '3600s'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailVerificationService],
  exports: [AuthService, EmailVerificationService],
})
export class AuthModule {}
