import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';

/** Machine-readable code clients can use to show a "verify your email" prompt. */
export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';

/**
 * Blocks accounts whose email address has not been verified.
 *
 * Use it after `JwtAuthGuard`, on any route that needs a verified identity:
 *
 *   @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
 *
 * Login already refuses unverified accounts, but a token can still exist for
 * one: registration returns tokens straight away, and a token stays valid
 * after the account it was issued for changes state. The guard therefore reads
 * the current `isVerified` flag from the database on each request instead of
 * trusting anything inside the token.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { userId?: string; sub?: string } }>();

    // JwtStrategy exposes the id as `userId`; older code reads `sub`.
    const userId = request.user?.userId ?? request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    let user: { isVerified?: boolean };
    try {
      user = await this.usersService.findById(userId);
    } catch (err) {
      if ((err as Error).message === 'User not found') {
        throw new UnauthorizedException('Authentication required');
      }
      throw err;
    }

    if (!user.isVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Verify your email address to use this feature',
        code: EMAIL_NOT_VERIFIED_CODE,
      });
    }

    return true;
  }
}
