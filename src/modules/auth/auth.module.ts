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
import { TwoFactor } from '../../database/entities/two-factor.entity';
import { EmailVerificationService } from './services/email-verification.service';
import { SessionService } from './services/session.service';
import { NotificationsModule } from '@/notifications/notifications.module';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { JwtRefreshStrategy } from '../../auth/strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../auth/guards/jwt-refresh.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './services/two-factor.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([EmailVerification, Session, TokenBlacklist, TwoFactor]),
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
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    EmailVerificationService,
    SessionService,
    TwoFactorService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    JwtRefreshGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    EmailVerificationService,
    SessionService,
    TwoFactorService,
    RolesGuard,
    JwtAuthGuard,
    JwtRefreshGuard,
  ],
})
export class AuthModule {}
