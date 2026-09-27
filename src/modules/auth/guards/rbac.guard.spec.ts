import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Role } from '../enums/role.enum';
import { Permission } from '../enums/permission.enum';
import {
  permissionsForRole,
  permissionsForRoles,
} from '../enums/role-permission.map';

const handler = () => undefined;
const controller = () => undefined;

function makeContext(user: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Reflector stub that returns preset metadata per key. */
function makeReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

describe('role-permission map (#1288)', () => {
  it('grants admins every permission', () => {
    expect(permissionsForRole(Role.ADMIN).sort()).toEqual(
      Object.values(Permission).sort(),
    );
  });

  it('does not let support escalate to user management', () => {
    const granted = permissionsForRole(Role.SUPPORT);
    expect(granted).toContain(Permission.READ_USERS);
    expect(granted).not.toContain(Permission.DELETE_USERS);
    expect(granted).not.toContain(Permission.ACCESS_ADMIN);
  });

  it('fails closed for an unknown role', () => {
    expect(permissionsForRole('GHOST')).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
  });

  it('unions permissions across multiple roles', () => {
    const merged = permissionsForRoles([Role.SUPPORT, Role.HEALER]);
    expect(merged).toContain(Permission.VIEW_ANALYTICS); // from SUPPORT
    expect(merged).toContain(Permission.REVIEW_TASKS); // from HEALER
  });
});

describe('RbacGuard (#1288)', () => {
  it('allows routes with no role or permission metadata', () => {
    const guard = new RbacGuard(makeReflector({}));
    expect(guard.canActivate(makeContext({ sub: 'u1', role: Role.USER }))).toBe(true);
  });

  it('allows a user holding the required role', () => {
    const guard = new RbacGuard(
      makeReflector({ [ROLES_KEY]: [Role.ADMIN] }),
    );
    expect(
      guard.canActivate(makeContext({ sub: 'u1', role: Role.ADMIN })),
    ).toBe(true);
  });

  it('throws 403 with an explanatory message when the role is missing', () => {
    const guard = new RbacGuard(
      makeReflector({ [ROLES_KEY]: [Role.ADMIN] }),
    );

    expect(() => guard.canActivate(makeContext({ sub: 'u1', role: Role.USER }))).toThrow(
      ForbiddenException,
    );

    try {
      guard.canActivate(makeContext({ sub: 'u1', role: Role.USER }));
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe('INSUFFICIENT_ROLE');
      expect(response.message).toContain('Administrator account');
    }
  });

  it('honours a custom message supplied on the requirement', () => {
    const guard = new RbacGuard(
      makeReflector({
        [ROLES_KEY]: [{ role: Role.ADMIN, message: 'Only administrators may do this' }],
      }),
    );

    try {
      guard.canActivate(makeContext({ sub: 'u1', role: Role.SUPPORT }));
      fail('expected ForbiddenException');
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as {
        message: string;
      };
      expect(response.message).toBe('Only administrators may do this');
    }
  });

  it('throws 401 when there is no authenticated identity', () => {
    const guard = new RbacGuard(
      makeReflector({ [ROLES_KEY]: [Role.ADMIN] }),
    );
    expect(() => guard.canActivate(makeContext(null))).toThrow(
      UnauthorizedException,
    );
  });

  it('resolves permissions from the caller role', () => {
    const guard = new RbacGuard(
      makeReflector({ [PERMISSIONS_KEY]: [Permission.VIEW_ANALYTICS] }),
    );
    expect(
      guard.canActivate(makeContext({ sub: 'u1', role: Role.SUPPORT })),
    ).toBe(true);
  });

  it('rejects a caller lacking a required permission and names it', () => {
    const guard = new RbacGuard(
      makeReflector({ [PERMISSIONS_KEY]: [Permission.DELETE_USERS] }),
    );

    try {
      guard.canActivate(makeContext({ sub: 'u1', role: Role.SUPPORT }));
      fail('expected ForbiddenException');
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as {
        code: string;
        missingPermissions: string[];
      };
      expect(response.code).toBe('INSUFFICIENT_PERMISSION');
      expect(response.missingPermissions).toEqual([Permission.DELETE_USERS]);
    }
  });

  it('ignores a permission claim the issuer never granted', () => {
    const guard = new RbacGuard(
      makeReflector({ [PERMISSIONS_KEY]: [Permission.DELETE_USERS] }),
    );

    // The token claims DELETE_USERS, but the caller's role does not grant it.
    expect(() =>
      guard.canActivate(
        makeContext({
          sub: 'u1',
          role: Role.SUPPORT,
          permissions: [Permission.DELETE_USERS],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets admins bypass permission checks so a new permission cannot lock them out', () => {
    const guard = new RbacGuard(
      makeReflector({ [PERMISSIONS_KEY]: [Permission.MANAGE_SETTINGS] }),
    );
    expect(
      guard.canActivate(makeContext({ sub: 'u1', role: Role.ADMIN })),
    ).toBe(true);
  });

  it('requires the role and the permission when both are declared', () => {
    const guard = new RbacGuard(
      makeReflector({
        [ROLES_KEY]: [Role.SUPPORT],
        [PERMISSIONS_KEY]: [Permission.DELETE_USERS],
      }),
    );

    // SUPPORT is allowed past the role check but not the permission check.
    expect(() =>
      guard.canActivate(makeContext({ sub: 'u1', role: Role.SUPPORT })),
    ).toThrow(ForbiddenException);

    // ADMIN is allowed past both.
    expect(
      guard.canActivate(makeContext({ sub: 'u2', role: Role.ADMIN })),
    ).toBe(true);
  });
});
