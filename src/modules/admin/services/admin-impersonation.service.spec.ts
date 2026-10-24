import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminImpersonationService } from './admin-impersonation.service';
import { User } from '@/entities/user.entity';
import { Role } from '@modules/auth/enums/role.enum';
import { CacheService } from '@/shared/cache/cache.service';
import { AuditService } from '@/audit/audit.service';

describe('AdminImpersonationService', () => {
  let service: AdminImpersonationService;
  let usersRepository: jest.Mocked<Repository<User>>;
  let cacheService: jest.Mocked<CacheService>;
  let auditService: jest.Mocked<AuditService>;
  let cacheStore: Map<string, any>;

  beforeEach(async () => {
    cacheStore = new Map<string, any>();

    const mockUsersRepository = {
      findOne: jest.fn(),
    };

    const mockCacheService = {
      set: jest.fn().mockImplementation((key, value) => {
        cacheStore.set(key, value);
        return Promise.resolve();
      }),
      get: jest.fn().mockImplementation((key) => {
        return Promise.resolve(cacheStore.get(key) || null);
      }),
    };

    const mockAuditService = {
      logEvent: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminImpersonationService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepository },
        { provide: CacheService, useValue: mockCacheService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AdminImpersonationService>(AdminImpersonationService);
    usersRepository = module.get(getRepositoryToken(User));
    cacheService = module.get(CacheService);
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startSession', () => {
    const adminId = 'admin-id-123';
    const targetUserId = 'user-id-456';
    const reason = 'Assisting with troubleshooting billing issue';
    let expiry: Date;

    beforeEach(() => {
      expiry = new Date(Date.now() + 10 * 60 * 1000);
    });

    it('creates an active, persisted session for a non-admin target and records an audit entry', async () => {
      usersRepository.findOne.mockResolvedValue({ id: targetUserId, role: Role.USER } as User);

      const result = await service.startSession(adminId, targetUserId, expiry, reason);

      expect(result.adminId).toBe(adminId);
      expect(result.targetUserId).toBe(targetUserId);
      expect(result.reason).toBe(reason);
      expect(result.isActive).toBe(true);
      expect(result.expiry).toBe(expiry.toISOString());

      // Observable outcome: the session can be read back from the store.
      const stored = await service.isSessionValid(result.id);
      expect(stored).toBe(true);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminId,
          resourceId: targetUserId,
          metadata: expect.objectContaining({ sessionId: result.id, reason }),
        }),
      );
    });

    it('rejects a target user that does not exist and persists nothing', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.startSession(adminId, targetUserId, expiry, reason),
      ).rejects.toThrow(NotFoundException);

      expect(cacheStore.size).toBe(0);
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });

    it('forbids impersonating another admin (authorization) and persists nothing', async () => {
      usersRepository.findOne.mockResolvedValue({ id: targetUserId, role: Role.ADMIN } as User);

      await expect(
        service.startSession(adminId, targetUserId, expiry, reason),
      ).rejects.toThrow(BadRequestException);

      expect(cacheStore.size).toBe(0);
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });

    it('rejects an expiry in the past (invalid input) and persists nothing', async () => {
      usersRepository.findOne.mockResolvedValue({ id: targetUserId, role: Role.USER } as User);
      const pastExpiry = new Date(Date.now() - 1000);

      await expect(
        service.startSession(adminId, targetUserId, pastExpiry, reason),
      ).rejects.toThrow(BadRequestException);

      expect(cacheStore.size).toBe(0);
    });

    it('surfaces a persistence failure from the cache and does not report success', async () => {
      usersRepository.findOne.mockResolvedValue({ id: targetUserId, role: Role.USER } as User);
      cacheService.set.mockRejectedValueOnce(new Error('cache unavailable'));

      await expect(
        service.startSession(adminId, targetUserId, expiry, reason),
      ).rejects.toThrow('cache unavailable');
    });
  });

  describe('endSession', () => {
    const sessionId = 'session-uuid-123';
    const adminId = 'admin-id-123';
    const targetUserId = 'user-id-456';
    const reason = 'Finished debug';
    let expiry: string;

    beforeEach(() => {
      expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    });

    it('ends an active session so it is no longer valid, and audits the early end', async () => {
      cacheStore.set(`impersonation:${sessionId}`, {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: true,
      });

      const result = await service.endSession(sessionId);

      expect(result.isActive).toBe(false);
      expect(await service.isSessionValid(sessionId)).toBe(false);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminId,
          resourceId: targetUserId,
          description: expect.stringContaining('Ended impersonation session early'),
        }),
      );
    });

    it('rejects ending a session that does not exist', async () => {
      await expect(service.endSession('non-existent')).rejects.toThrow(BadRequestException);
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });

    it('rejects ending a session that is already inactive (no duplicate audit)', async () => {
      cacheStore.set(`impersonation:${sessionId}`, {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: false,
      });

      await expect(service.endSession(sessionId)).rejects.toThrow(BadRequestException);
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('isSessionValid', () => {
    const sessionId = 'session-uuid-123';
    const adminId = 'admin-id-123';
    const targetUserId = 'user-id-456';
    const reason = 'Debug';

    it('returns true for an active, non-expired session', async () => {
      cacheStore.set(`impersonation:${sessionId}`, {
        id: sessionId,
        adminId,
        targetUserId,
        expiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        reason,
        isActive: true,
      });

      expect(await service.isSessionValid(sessionId)).toBe(true);
    });

    it('returns false for an inactive session', async () => {
      cacheStore.set(`impersonation:${sessionId}`, {
        id: sessionId,
        adminId,
        targetUserId,
        expiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        reason,
        isActive: false,
      });

      expect(await service.isSessionValid(sessionId)).toBe(false);
    });

    it('returns false for an expired session', async () => {
      cacheStore.set(`impersonation:${sessionId}`, {
        id: sessionId,
        adminId,
        targetUserId,
        expiry: new Date(Date.now() - 1000).toISOString(),
        reason,
        isActive: true,
      });

      expect(await service.isSessionValid(sessionId)).toBe(false);
    });

    it('returns false for an unknown session id', async () => {
      expect(await service.isSessionValid('non-existent')).toBe(false);
    });
  });
});
