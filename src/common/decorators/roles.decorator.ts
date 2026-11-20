import { SetMetadata } from '@nestjs/common';
import { Role } from '@modules/auth/enums/role.enum';

/** Metadata key used by {@link RolesGuard} to resolve required roles on a route. */
export const ROLES_KEY = 'roles';

/**
 * Decorator that restricts a route handler or controller to users who hold
 * at least one of the specified {@link Role} values.
 *
 * Apply this decorator alongside an authentication guard (e.g. `JwtAuthGuard`)
 * so that the `user` object is available on the request when {@link RolesGuard}
 * evaluates access.  Users with the `ADMIN` role are granted access regardless
 * of which roles are listed here.
 *
 * @param roles - One or more {@link Role} values that are allowed to access the
 *   decorated route or controller.
 * @returns A NestJS metadata decorator that stores the role list under
 *   {@link ROLES_KEY}.
 *
 * @example
 * ```ts
 * @Roles(Role.ADMIN, Role.PROVIDER)
 * @Get('admin-only')
 * getAdminData() {}
 * ```
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
