import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '@modules/auth/enums/permission.enum';

/**
 * PermissionsGuard enforces granular permission-based access control on
 * route handlers decorated with `@Permissions(...)`.
 *
 * On each incoming request it reads the list of required {@link Permission}
 * values from the route/controller metadata and compares them against the
 * `permissions` array on the authenticated user object.  Access is denied
 * (throws `ForbiddenException`) when the user is missing one or more of the
 * required permissions.  Routes that carry no `@Permissions` metadata are
 * allowed through unconditionally.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    const userPermissions: Permission[] = user.permissions || [];

    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions for this resource');
    }

    return true;
  }
}
