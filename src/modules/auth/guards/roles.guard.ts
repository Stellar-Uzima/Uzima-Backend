// src/auth/guards/roles.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

/**
 * Enforces role-based access control. Reads the roles required by the
 * current route handler/class via the `@Roles()` decorator (using
 * `Reflector` to resolve the `ROLES_KEY` metadata), then compares them
 * against `request.user.role` — the authenticated user populated by
 * `JwtAuthGuard`.
 *
 * Routes with no `@Roles()` metadata are allowed through unchanged.
 * Denies access with a 403 Forbidden response when the user is missing,
 * has no role, or does not hold one of the required roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      // No roles required for this endpoint
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'You do not have permission (role required)',
      );
    }

    return true;
  }
}
