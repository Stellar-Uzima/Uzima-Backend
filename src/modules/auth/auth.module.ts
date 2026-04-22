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
import { Session } from '../../database/entities/session.entity';
import { SessionService } from './services/session.service';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
  TypeOrmModule.forFeature([EmailVerification, Session]),
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
  providers: [AuthService, EmailVerificationService, SessionService],
  exports: [AuthService, EmailVerificationService, SessionService],
})
export class AuthModule {}
