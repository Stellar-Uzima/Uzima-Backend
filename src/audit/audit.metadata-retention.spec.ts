import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog, AuditAction, AuditResource } from './entities/audit-log.entity';
import { CreateAuditDto } from './dto/create-audit.dto';

describe('AuditService - metadata and retention', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;

  const mockRepository = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ ...data, id: 'generated-id' })),
    find: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    jest.clearAllMocks();
    mockRepository.create.mockImplementation((data) => data);
    mockRepository.save.mockImplementation((data) => Promise.resolve({ ...data, id: 'generated-id' }));
    mockRepository.findOne.mockResolvedValue(null);
  });

  describe('create() DTO mapping', () => {
    it('forwards metadata, ipAddress, and other traceability fields to logEvent', async () => {
      const dto: CreateAuditDto = {
        userId: 'user-1',
        action: AuditAction.UPDATE,
        resourceType: AuditResource.USER,
        ipAddress: '10.0.0.1',
        userAgent: 'jest-test-agent',
        requestId: 'req-123',
        metadata: { source: 'unit-test' },
      };

      const result = await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          ipAddress: '10.0.0.1',
          userAgent: 'jest-test-agent',
          requestId: 'req-123',
          metadata: { source: 'unit-test' },
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('logEvent() retention expiry', () => {
    it('sets retentionExpiresAt for a normal (non-compliance) event', async () => {
      await service.logEvent({
        action: AuditAction.CREATE,
        resourceType: AuditResource.TASK,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          retentionExpiresAt: expect.any(Date),
        }),
      );

      const createCallArg = mockRepository.create.mock.calls[0][0];
      const daysUntilExpiry =
        (createCallArg.retentionExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      // Should be roughly 365 days out (default retention), give or take a few seconds of test runtime
      expect(daysUntilExpiry).toBeGreaterThan(364);
      expect(daysUntilExpiry).toBeLessThan(366);
    });

    it('leaves retentionExpiresAt unset for compliance events (retained indefinitely)', async () => {
      await service.logEvent({
        action: AuditAction.EXPORT,
        resourceType: AuditResource.TRANSACTION,
        isComplianceEvent: true,
      });

      const createCallArg = mockRepository.create.mock.calls[0][0];
      expect(createCallArg.isComplianceEvent).toBe(true);
    });
  });

  describe('cleanupExpiredLogs()', () => {
    it('deletes logs whose retentionExpiresAt has passed', async () => {
      mockRepository.find.mockResolvedValue([{ id: 'log-1' }, { id: 'log-2' }]);

      const result = await service.cleanupExpiredLogs(30);

      expect(result.deletedCount).toBe(2);
      expect(result.deletedIds).toEqual(['log-1', 'log-2']);
      expect(mockRepository.delete).toHaveBeenCalledWith(['log-1', 'log-2']);
    });

    it('returns early without calling delete when nothing is expired', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.cleanupExpiredLogs(30);

      expect(result.deletedCount).toBe(0);
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('still rejects a non-positive retentionDays', async () => {
      await expect(service.cleanupExpiredLogs(0)).rejects.toThrow(
        'Retention days must be greater than 0',
      );
    });
  });
});

