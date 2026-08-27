import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/permission.enum';

/** Metadata key used by PermissionsGuard to resolve required permissions */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator that marks an endpoint as requiring specific granular permissions.
 * Use alongside @Roles() for defense-in-depth authorization.
 *
 * @example
 * ```ts
 * @Permissions(Permission.WRITE_RECORDS, Permission.READ_USERS)
 * @Post('records')
 * createRecord() {}
 * ```
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
