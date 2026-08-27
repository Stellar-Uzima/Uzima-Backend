import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';

import { AdminController } from './admin.controller';
import { AdminTasksController } from './admin-tasks.controller';
import { AdminUsersController } from './admin-users.controller';
import { FailedRewardJobController } from './rewards/failed-reward-job.controller';

/**
 * Guards against regressions where an admin-only controller
 * accidentally loses its JwtAuthGuard/RolesGuard(ADMIN) protection.
 * RolesGuard's own allow/deny logic is covered in roles.guard.spec.ts;
 * this file only asserts the metadata wiring on each controller.
 */
describe('Admin controllers - role guard coverage', () => {
  const adminControllers = [
    AdminController,
    AdminTasksController,
    AdminUsersController,
    FailedRewardJobController,
  ];

  it.each(adminControllers)(
    '%p is protected by JwtAuthGuard and RolesGuard',
    (controller) => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) || [];
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    },
  );

  it.each(adminControllers)(
    '%p requires Role.ADMIN',
    (controller) => {
      const roles = Reflect.getMetadata(ROLES_KEY, controller) || [];
      expect(roles).toContain(Role.ADMIN);
    },
  );

  it.each(adminControllers)(
    '%p does not silently accept an unauthenticated/roleless request',
    (controller) => {
      // Sanity check: RolesGuard is unusable without JwtAuthGuard populating request.user
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) || [];
      const guardIndex = guards.indexOf(RolesGuard);
      const authIndex = guards.indexOf(JwtAuthGuard);
      expect(authIndex).toBeGreaterThanOrEqual(0);
      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(authIndex).toBeLessThan(guardIndex);
    },
  );
});