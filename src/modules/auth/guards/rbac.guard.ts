import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';
import {
  permissionsForRole,
  permissionsForRoles,
  ROLE_DESCRIPTIONS,
} from '../enums/role-permission.map';

/**
 * Options accepted when a route handler narrows a role requirement, e.g.
 * `@Roles({ role: Role.ADMIN, message: 'Only administrators...' })`.
 */
export interface RoleRequirement {
  role: Role;
  message?: string;
}

/**
 * Single guard that enforces both role and permission requirements (#1288).
 *
 * Declaring access control in one place removes the previous situation where a
 * handler opted into `RolesGuard` on some routes and nothing at all on others.
 * Registered globally through `APP_GUARD`, so:
 *
 *  - a route with neither `@Roles` nor `@Permissions` is public to any
 *    authenticated caller and is left untouched;
 *  - a route with `@Roles` requires the caller to hold one of the roles;
 *  - a route with `@Permissions` requires the caller to hold every listed
 *    permission, resolved from their role(s) via {@link ROLE_PERMISSIONS};
 *  - a route with both requires the role *and* the permissions;
 *  - a missing/invalid identity is a 401, a valid identity without the grant
 *    is a 403, and the 403 body always names the missing requirement.
 *
 * Fail-closed is deliberate: an unrecognised role resolves to an empty
 * permission set, so an unmapped role can never be accidentally authorised.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const requiredRoles = this.readRequirements<RoleRequirement | Role>(
      this.reflector.getAllAndOverride(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles.length === 0 && (!requiredPermissions || requiredPermissions.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user || (!user.sub && !user.id && !user.userId)) {
      throw new UnauthorizedException('Authentication is required for this resource');
    }

    const userId = (user.sub ?? user.id ?? user.userId) as string;
    const userRoles = this.extractRoles(user);
    const userPermissions = this.extractPermissions(user, userRoles);

    if (requiredRoles.length > 0) {
      this.assertRole(userId, userRoles, requiredRoles);
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      this.assertPermissions(userId, userRoles, userPermissions, requiredPermissions);
    }

    return true;
  }

  private assertRole(
    userId: string,
    userRoles: string[],
    required: RoleRequirement[],
  ): void {
    const held = new Set(userRoles);
    const allowed = required.filter(({ role }) => held.has(role));
    if (allowed.length > 0) {
      return;
    }

    const firstMissing = required[0];
    const readable = required
      .map(({ role }) => ROLE_DESCRIPTIONS[role] ?? role)
      .join(' or ');

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'INSUFFICIENT_ROLE',
      message:
        firstMissing.message ??
        `Access denied: this action requires the ${readable} role`,
      requiredRoles: required.map(({ role }) => role),
      userId,
    });
  }

  private assertPermissions(
    userId: string,
    userRoles: string[],
    userPermissions: Permission[],
    required: Permission[],
  ): void {
    const held = new Set(userPermissions);
    const missing = required.filter((permission) => !held.has(permission));

    if (missing.length === 0) {
      return;
    }

    // Admins bypass permission checks so a newly added permission cannot lock
    // administrators out of their own endpoints.
    if (userRoles.includes(Role.ADMIN)) {
      return;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'INSUFFICIENT_PERMISSION',
      message: `Access denied: missing required permission(s) ${missing.join(', ')}`,
      missingPermissions: missing,
      userId,
    });
  }

  private readRequirements<T extends RoleRequirement | Role>(
    raw: unknown,
  ): RoleRequirement[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((entry) =>
      typeof entry === 'string' ? { role: entry as Role } : (entry as RoleRequirement),
    );
  }

  private extractRoles(user: Record<string, unknown>): string[] {
    const candidates: unknown[] = [user.roles, user.role];
    const roles: string[] = [];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        roles.push(candidate);
      } else if (Array.isArray(candidate)) {
        for (const role of candidate) {
          if (typeof role === 'string' && role.length > 0) {
            roles.push(role);
          }
        }
      }
    }
    return Array.from(new Set(roles));
  }

  /**
   * Permissions are the union of (a) any explicitly embedded claim and (b)
   * whatever the user's roles grant. Embedded claims are validated against the
   * role map so a token cannot self-escalate by carrying a permission the
   * issuer never granted.
   */
  private extractPermissions(
    user: Record<string, unknown>,
    userRoles: string[],
  ): Permission[] {
    const fromRoles = permissionsForRoles(userRoles);

    const declared = user.permissions;
    if (!Array.isArray(declared)) {
      return fromRoles;
    }

    const allowed = new Set<Permission>(fromRoles);
    const roleGranted = new Set<Permission>();
    for (const role of userRoles) {
      for (const permission of permissionsForRole(role)) {
        roleGranted.add(permission);
      }
    }

    for (const permission of declared) {
      if (typeof permission === 'string' && roleGranted.has(permission as Permission)) {
        allowed.add(permission as Permission);
      }
    }

    return Array.from(allowed);
  }
}
