import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '@modules/users/users.module';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { Session } from '../../database/entities/session.entity';
import { TokenBlacklist } from '../../database/entities/token-blacklist.entity';
import { EmailVerificationService } from './services/email-verification.service';
import { SessionService } from './services/session.service';
import { NotificationsModule } from '@/notifications/notifications.module';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { JwtRefreshStrategy } from '../../auth/strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../auth/guards/jwt-refresh.guard';

import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([EmailVerification, Session, TokenBlacklist]),
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
  providers: [
    AuthService,
    EmailVerificationService,
    SessionService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    JwtRefreshGuard,
    RolesGuard,
  ],
  exports: [AuthService, EmailVerificationService, SessionService, RolesGuard],
})
export class AuthModule {}
