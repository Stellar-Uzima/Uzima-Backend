import { Permission } from './permission.enum';
import { Role } from './role.enum';

/**
 * Canonical role -> permission grants (#1288).
 *
 * This is the single source of truth for "what can a role do". Endpoint
 * handlers still declare their requirement with `@Roles(...)` and/or
 * `@Permissions(...)`; this map is what turns a role into a permission set so
 * permission-decorated routes work without every handler having to enumerate
 * roles.
 *
 * A role only ever gains permissions, never has them subtracted, so a
 * deployment can safely add a role without auditing the whole codebase.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> =
  Object.freeze({
    /** End users act on their own data only; enforcement of that is per-resource. */
    [Role.USER]: Object.freeze([
      Permission.READ_RECORDS,
      Permission.WRITE_RECORDS,
      Permission.READ_USERS,
      Permission.WRITE_USERS,
      Permission.CREATE_TASKS,
    ] as Permission[]),

    /** Healers review and complete the tasks assigned to them. */
    [Role.HEALER]: Object.freeze([
      Permission.READ_RECORDS,
      Permission.WRITE_RECORDS,
      Permission.READ_USERS,
      Permission.REVIEW_TASKS,
      Permission.ASSIGN_TASKS,
    ] as Permission[]),

    /**
     * Support staff get read access to users and analytics. Deliberately no
     * `DELETE_USERS`, `MANAGE_SETTINGS` or `ACCESS_ADMIN`.
     */
    [Role.SUPPORT]: Object.freeze([
      Permission.READ_RECORDS,
      Permission.READ_USERS,
      Permission.VIEW_ANALYTICS,
    ] as Permission[]),

    /** Admins hold every permission. */
    [Role.ADMIN]: Object.freeze(
      Object.values(Permission) as Permission[],
    ),
  });

/**
 * Returns the permission set granted to a role. Unknown or missing roles get
 * an empty set — failing closed is the only safe default for authorisation.
 */
export function permissionsForRole(role: Role | string | undefined | null): Permission[] {
  if (!role) {
    return [];
  }
  return [...(ROLE_PERMISSIONS[role as Role] ?? [])];
}

/**
 * Returns the permissions a user holds, unioning the grants of every role they
 * carry. A user with multiple roles gets the strongest capability of each.
 */
export function permissionsForRoles(
  roles: ReadonlyArray<Role | string> | undefined | null,
): Permission[] {
  if (!roles || roles.length === 0) {
    return [];
  }

  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of permissionsForRole(role)) {
      granted.add(permission);
    }
  }
  return Array.from(granted);
}

/** Human-readable description of a role, surfaced in 403 responses. */
export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = Object.freeze({
  [Role.USER]: 'Standard end-user account',
  [Role.HEALER]: 'Healthcare provider account',
  [Role.SUPPORT]: 'Support agent account',
  [Role.ADMIN]: 'Administrator account',
});
