import { User } from '@/entities/user.entity';
import { UserStatusLog } from '@/entities/user-status-log.entity';
import { Session } from '@/database/entities/session.entity';
import { AuditService } from '@/audit/audit.service';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { Role } from '@modules/auth/enums/role.enum';
import { ApiErrorException } from '@/common/errors/api-error.exception';
import { ApiErrorCode } from '@/common/errors/api-error-codes.enum';
import { UserDeactivationService, ActorContext } from './user-deactivation.service';
import { DeactivationReasonCode } from '../dto/deactivate-user.dto';

const ADMIN: ActorContext = { id: 'admin-1', role: Role.ADMIN, ipAddress: '10.0.0.1' };

/** Minimal in-memory stand-in for a transactional EntityManager. */
function makeEntityManager(options: {
  user?: Partial<User> | null;
  adminCount?: number;
  lastDeactivation?: Partial<UserStatusLog> | null;
}) {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(options.user ?? null),
    count: jest.fn().mockResolvedValue(options.adminCount ?? 0),
    save: jest.fn().mockImplementation(async (entity) => entity),
    create: jest.fn().mockImplementation((partial) => partial),
  };
  const statusLogRepo = {
    findOne: jest.fn().mockResolvedValue(options.lastDeactivation ?? null),
    save: jest.fn().mockImplementation(async (entity) => entity),
    create: jest.fn().mockImplementation((partial) => partial),
  };

  const em = {
    getRepository: jest.fn((entity: unknown) =>
      entity === User ? userRepo : entity === UserStatusLog ? statusLogRepo : ({} as never),
    ),
  };

  return { em, userRepo, statusLogRepo };
}

function makeService(options: Parameters<typeof makeEntityManager>[0]) {
  const { em, userRepo, statusLogRepo } = makeEntityManager(options);

  const sessionsRepository = {
    createQueryBuilder: () => ({ delete: () => ({ where: () => ({ execute: jest.fn().mockResolvedValue({}) }) }) }),
  };
  const auditService = { logEvent: jest.fn().mockResolvedValue({}) };
  const manager = { transaction: (cb: (m: unknown) => unknown) => cb(em) };

  const service = new UserDeactivationService(
    { manager } as never,
    { manager } as never,
    sessionsRepository as never,
    auditService as unknown as AuditService,
  );

  // `usersRepository.exist` is used by history(); keep it predictable.
  (service as unknown as { usersRepository: { exist: jest.Mock } }).usersRepository.exist = jest
    .fn()
    .mockResolvedValue(Boolean(options.user));

  jest
    .spyOn(service as unknown as { revokeSessions: () => Promise<boolean> }, 'revokeSessions')
    .mockResolvedValue(true);

  return { service, userRepo, statusLogRepo, auditService };
}

const activeUser = (overrides: Partial<User> = {}): Partial<User> => ({
  id: 'user-1',
  email: 'amaka@example.com',
  role: Role.USER,
  status: UserStatus.ACTIVE,
  isActive: true,
  ...overrides,
});

describe('UserDeactivationService (#1291)', () => {
  describe('deactivate', () => {
    it('requires an explicit confirmation', async () => {
      const { service } = makeService({ user: activeUser() });

      await expect(
        service.deactivate('user-1', { reasonCode: DeactivationReasonCode.USER_REQUEST, confirm: false }, ADMIN),
      ).rejects.toMatchObject({ code: ApiErrorCode.CONFIRMATION_REQUIRED });
    });

    it('refuses to let an admin deactivate their own account', async () => {
      const { service } = makeService({ user: activeUser() });
      const self: ActorContext = { id: 'user-1', role: Role.ADMIN };

      await expect(
        service.deactivate('user-1', { reasonCode: DeactivationReasonCode.USER_REQUEST, confirm: true }, self),
      ).rejects.toMatchObject({ code: ApiErrorCode.CANNOT_DEACTIVATE_SELF });
    });

    it('refuses to remove the last active admin', async () => {
      const { service } = makeService({
        user: activeUser({ role: Role.ADMIN }),
        adminCount: 1,
      });

      await expect(
        service.deactivate('user-1', { reasonCode: DeactivationReasonCode.ADMIN_POLICY, confirm: true }, ADMIN),
      ).rejects.toMatchObject({ code: ApiErrorCode.CANNOT_DEACTIVATE_LAST_ADMIN });
    });

    it('allows deactivating an admin while another active admin remains', async () => {
      const { service, userRepo } = makeService({
        user: activeUser({ role: Role.ADMIN }),
        adminCount: 2,
      });

      const result = await service.deactivate(
        'user-1',
        { reasonCode: DeactivationReasonCode.ADMIN_POLICY, confirm: true },
        ADMIN,
      );

      expect(result.newStatus).toBe(UserStatus.INACTIVE);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UserStatus.INACTIVE,
          isActive: false,
          refreshToken: null,
        }),
      );
    });

    it('rejects an inverted requirement: reasonCode OTHER with no reason', async () => {
      const { service } = makeService({ user: activeUser() });

      await expect(
        service.deactivate('user-1', { reasonCode: DeactivationReasonCode.OTHER, confirm: true }, ADMIN),
      ).rejects.toBeInstanceOf(ApiErrorException);
    });

    it('is idempotent-safe: deactivating an inactive account is a conflict', async () => {
      const { service } = makeService({
        user: activeUser({ status: UserStatus.INACTIVE, isActive: false }),
      });

      await expect(
        service.deactivate('user-1', { reasonCode: DeactivationReasonCode.USER_REQUEST, confirm: true }, ADMIN),
      ).rejects.toMatchObject({ code: ApiErrorCode.ACCOUNT_ALREADY_INACTIVE });
    });

    it('404s for an unknown user', async () => {
      const { service } = makeService({ user: null });

      await expect(
        service.deactivate('nope', { reasonCode: DeactivationReasonCode.USER_REQUEST, confirm: true }, ADMIN),
      ).rejects.toMatchObject({ code: ApiErrorCode.USER_NOT_FOUND });
    });

    it('writes a status log and a compliance audit event', async () => {
      const { service, statusLogRepo, auditService } = makeService({ user: activeUser() });

      await service.deactivate(
        'user-1',
        { reasonCode: DeactivationReasonCode.USER_REQUEST, reason: 'user asked to leave', confirm: true },
        ADMIN,
      );

      expect(statusLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          previousStatus: UserStatus.ACTIVE,
          newStatus: UserStatus.INACTIVE,
          changedBy: 'admin-1',
        }),
      );

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: 'user-1',
          isComplianceEvent: true,
          complianceCategory: 'account_lifecycle',
        }),
      );
    });

    it('retains the user row instead of deleting it', async () => {
      const { service, userRepo } = makeService({ user: activeUser() });

      const result = await service.deactivate(
        'user-1',
        { reasonCode: DeactivationReasonCode.USER_REQUEST, confirm: true },
        ADMIN,
      );

      expect(result.dataRetained).toBe(true);
      expect((userRepo as { remove?: jest.Mock }).remove).toBeUndefined();
    });
  });

  describe('reactivate', () => {
    it('restores an inactive account and clears lockout counters', async () => {
      const { service, userRepo } = makeService({
        user: activeUser({ status: UserStatus.INACTIVE, isActive: false, failedLoginAttempts: 5 }),
      });

      const result = await service.reactivate('user-1', { confirm: true }, ADMIN);

      expect(result.newStatus).toBe(UserStatus.ACTIVE);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UserStatus.ACTIVE,
          isActive: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
    });

    it('refuses to restore an account flagged for suspicious activity', async () => {
      const { service } = makeService({
        user: activeUser({ status: UserStatus.INACTIVE, isActive: false }),
        lastDeactivation: { reason: `Deactivated (${DeactivationReasonCode.SUSPICIOUS_ACTIVITY})` },
      });

      await expect(service.reactivate('user-1', { confirm: true }, ADMIN)).rejects.toMatchObject({
        code: ApiErrorCode.REACTIVATION_NOT_PERMITTED,
      });
    });

    it('is a conflict when the account is already active', async () => {
      const { service } = makeService({ user: activeUser() });

      await expect(service.reactivate('user-1', { confirm: true }, ADMIN)).rejects.toMatchObject({
        code: ApiErrorCode.ACCOUNT_ALREADY_ACTIVE,
      });
    });
  });
});
