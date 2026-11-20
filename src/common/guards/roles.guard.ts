import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@modules/auth/enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard that enforces role-based access control on route handlers decorated
 * with `@Roles(...)`.
 *
 * On each incoming request it reads the list of required {@link Role} values
 * from the route/controller metadata and compares them against the `role`
 * field on the authenticated user object.  Users with the `ADMIN` role are
 * granted unconditional access.  Access is denied (throws
 * `ForbiddenException`) when the user does not hold any of the required
 * roles.  Routes that carry no `@Roles` metadata are allowed through
 * unconditionally.
 *
 * This guard should always be used after an authentication guard (e.g.
 * `JwtAuthGuard`) so that `request.user` is populated before the role check
 * runs.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Determines whether the current request is allowed to proceed.
   *
   * @param context - The NestJS execution context providing access to the
   *   current HTTP request and the route metadata.
   * @returns `true` when the authenticated user holds at least one of the
   *   required roles (or no roles are required); throws `ForbiddenException`
   *   otherwise.
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // If user is not present (should be handled by AuthGuard), deny access
    if (!user) {
      return false;
    }

    // Admin role grants access to all endpoints
    if (user.role === Role.ADMIN) {
      return true;
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
