import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { Session } from '../../database/entities/session.entity';
import { TokenBlacklist } from '../../database/entities/token-blacklist.entity';
import { TwoFactor } from '../../database/entities/two-factor.entity';
import { User } from '../../entities/user.entity';
import { EmailVerificationService } from './services/email-verification.service';
import { SessionService } from './services/session.service';
import { NotificationsModule } from '@/notifications/notifications.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { RolesGuard } from './guards/roles.guard';
import { RbacGuard } from './guards/rbac.guard';
import { TokenRevocationGuard } from './guards/token-revocation.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { TokenRevocationGuard } from './guards/token-revocation.guard';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './services/two-factor.service';
import { OtpModule } from '../../otp/otp.module';
import { AuditModule } from '../../audit/audit.module';
import { AuthEventAuditController } from '../../audit/auth-event-audit.controller';
import { AuthEventAuditService } from '../../audit/services/auth-event-audit.service';
import { UsersService } from './services/users.service';
import { DatabaseModule } from '../../database/database.module';
import { ReferralModule } from '../../referral/referral.module';
import { PasswordValidationPipe } from '../../common/pipes/password-validation.pipe';

@Module({
  imports: [
    OtpModule,
    AuditModule,
    DatabaseModule,
    ReferralModule,
    PassportModule,
    TypeOrmModule.forFeature([User, EmailVerification, Session, TokenBlacklist, TwoFactor]),
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION', '3600s') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, TwoFactorController, AuthEventAuditController],
  providers: [
    AuthService,
    UsersService,
    EmailVerificationService,
    SessionService,
    TwoFactorService,
    AuthEventAuditService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    JwtRefreshGuard,
    RolesGuard,
    PermissionsGuard,
    TokenRevocationGuard,
    PasswordValidationPipe,
    // Registered globally so role/permission declarations on a handler are
    // always enforced, even on routes that forget `@UseGuards(RolesGuard)`.
    // Routes without `@Roles`/`@Permissions` metadata are unaffected.
    { provide: APP_GUARD, useClass: RbacGuard },
    // Runs after the passport guard has populated `request.user`, so revoked
    // tokens are rejected before any business logic executes.
    { provide: APP_GUARD, useClass: TokenRevocationGuard },
  ],
  exports: [
    AuthService,
    EmailVerificationService,
    SessionService,
    TwoFactorService,
    AuthEventAuditService,
    RolesGuard,
    RbacGuard,
    PermissionsGuard,
    TokenRevocationGuard,
    JwtAuthGuard,
    JwtRefreshGuard,
    TokenRevocationGuard,
    JwtModule,
  ],
})
export class AuthModule {}
