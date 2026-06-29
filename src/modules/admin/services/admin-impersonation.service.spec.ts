import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminImpersonationService } from './admin-impersonation.service';
import { User } from '@/entities/user.entity';
import { Role } from '@modules/auth/enums/role.enum';
import { CacheService } from '@/shared/cache/cache.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResource } from '@/audit/entities/audit-log.entity';

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
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
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
      expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
    });

    it('should successfully start an impersonation session for a non-admin user', async () => {
      const targetUser = { id: targetUserId, role: Role.USER } as User;
      usersRepository.findOne.mockResolvedValue(targetUser);

      const result = await service.startSession(adminId, targetUserId, expiry, reason);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.adminId).toBe(adminId);
      expect(result.targetUserId).toBe(targetUserId);
      expect(result.reason).toBe(reason);
      expect(result.isActive).toBe(true);
      expect(result.expiry).toBe(expiry.toISOString());

      // Check stored in cache
      expect(cacheService.set).toHaveBeenCalledWith(
        `impersonation:${result.id}`,
        result,
        expect.any(Object),
      );

      // Verify audit logging
      expect(auditService.logEvent).toHaveBeenCalledWith({
        userId: adminId,
        action: AuditAction.CREATE,
        resourceType: AuditResource.USER,
        resourceId: targetUserId,
        description: expect.stringContaining(reason),
        metadata: {
          sessionId: result.id,
          adminId,
          targetUserId,
          reason,
          expiry: expiry.toISOString(),
        },
      });
    });

    it('should throw NotFoundException if target user does not exist', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(
        service.startSession(adminId, targetUserId, expiry, reason),
      ).rejects.toThrow(NotFoundException);

      expect(cacheService.set).not.toHaveBeenCalled();
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when attempting to impersonate an admin', async () => {
      const targetUser = { id: targetUserId, role: Role.ADMIN } as User;
      usersRepository.findOne.mockResolvedValue(targetUser);

      await expect(
        service.startSession(adminId, targetUserId, expiry, reason),
      ).rejects.toThrow(BadRequestException);

      expect(cacheService.set).not.toHaveBeenCalled();
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if expiry is in the past or now', async () => {
      const targetUser = { id: targetUserId, role: Role.USER } as User;
      usersRepository.findOne.mockResolvedValue(targetUser);
      const pastExpiry = new Date(Date.now() - 1000);

      await expect(
        service.startSession(adminId, targetUserId, pastExpiry, reason),
      ).rejects.toThrow(BadRequestException);

      expect(cacheService.set).not.toHaveBeenCalled();
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

    it('should end the session early successfully and log to audit service', async () => {
      const activeSession = {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: true,
      };
      cacheStore.set(`impersonation:${sessionId}`, activeSession);

      const result = await service.endSession(sessionId);

      expect(result.isActive).toBe(false);
      expect(cacheStore.get(`impersonation:${sessionId}`).isActive).toBe(false);

      expect(auditService.logEvent).toHaveBeenCalledWith({
        userId: adminId,
        action: AuditAction.UPDATE,
        resourceType: AuditResource.USER,
        resourceId: targetUserId,
        description: expect.stringContaining('Ended impersonation session early'),
        metadata: {
          sessionId,
          adminId,
          targetUserId,
          reason,
        },
      });
    });

    it('should throw BadRequestException if session is not found in cache', async () => {
      await expect(service.endSession('non-existent')).rejects.toThrow(BadRequestException);
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if session is already ended/inactive', async () => {
      const inactiveSession = {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: false,
      };
      cacheStore.set(`impersonation:${sessionId}`, inactiveSession);

      await expect(service.endSession(sessionId)).rejects.toThrow(BadRequestException);
      expect(auditService.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('isSessionValid', () => {
    const sessionId = 'session-uuid-123';
    const adminId = 'admin-id-123';
    const targetUserId = 'user-id-456';
    const reason = 'Debug';

    it('should return true for active, non-expired sessions', async () => {
      const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const session = {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: true,
      };
      cacheStore.set(`impersonation:${sessionId}`, session);

      const isValid = await service.isSessionValid(sessionId);
      expect(isValid).toBe(true);
    });

    it('should return false if session is inactive', async () => {
      const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const session = {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: false,
      };
      cacheStore.set(`impersonation:${sessionId}`, session);

      const isValid = await service.isSessionValid(sessionId);
      expect(isValid).toBe(false);
    });

    it('should return false if session is expired', async () => {
      const expiry = new Date(Date.now() - 1000).toISOString(); // 1s ago
      const session = {
        id: sessionId,
        adminId,
        targetUserId,
        expiry,
        reason,
        isActive: true,
      };
      cacheStore.set(`impersonation:${sessionId}`, session);

      const isValid = await service.isSessionValid(sessionId);
      expect(isValid).toBe(false);
    });

    it('should return false if session is not found in cache', async () => {
      const isValid = await service.isSessionValid('non-existent');
      expect(isValid).toBe(false);
    });
  });
});
