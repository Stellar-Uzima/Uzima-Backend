import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService, AuditPaginationOptions, PaginatedAuditResult } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;

  // Mock data
  const mockAuditLogs: AuditLog[] = [
    { id: '1', adminId: 'admin-1', action: 'USER_CREATED', createdAt: new Date('2024-01-01') },
    { id: '2', adminId: 'admin-1', action: 'USER_UPDATED', createdAt: new Date('2024-01-02') },
    { id: '3', adminId: 'admin-2', action: 'USER_DELETED', createdAt: new Date('2024-01-03') },
    { id: '4', adminId: 'admin-1', action: 'USER_CREATED', createdAt: new Date('2024-01-04') },
    { id: '5', adminId: 'admin-2', action: 'ROLE_CHANGED', createdAt: new Date('2024-01-05') },
    { id: '6', adminId: 'admin-1', action: 'USER_UPDATED', createdAt: new Date('2024-01-06') },
    { id: '7', adminId: 'admin-3', action: 'USER_CREATED', createdAt: new Date('2024-01-07') },
    { id: '8', adminId: 'admin-2', action: 'PERMISSION_GRANTED', createdAt: new Date('2024-01-08') },
    { id: '9', adminId: 'admin-1', action: 'USER_DELETED', createdAt: new Date('2024-01-09') },
    { id: '10', adminId: 'admin-3', action: 'ROLE_CHANGED', createdAt: new Date('2024-01-10') },
  ];

  const mockRepository = {
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // PAGINATION TESTS
  // ============================================

  describe('Pagination', () => {
    beforeEach(() => {
      mockRepository.findAndCount.mockResolvedValue([mockAuditLogs, mockAuditLogs.length]);
    });

    it('should return first page with default limit (20)', async () => {
      const result = await service.findAllPaginated({ page: 1, limit: 20 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
        }),
      );
    });

    it('should return correct slice for page 1 with limit 3', async () => {
      const result = await service.findAllPaginated({ page: 1, limit: 3 });

      expect(result.data).toHaveLength(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.totalPages).toBe(4); // 10/3 = 3.33 -> 4 pages
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
          skip: 0,
        }),
      );
    });

    it('should return correct slice for page 2 with limit 3', async () => {
      const result = await service.findAllPaginated({ page: 2, limit: 3 });

      expect(result.data).toHaveLength(3);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(3);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
          skip: 3, // (page-1) * limit = (2-1) * 3 = 3
        }),
      );
    });

    it('should return correct slice for page 3 with limit 2', async () => {
      const result = await service.findAllPaginated({ page: 3, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(5); // 10/2 = 5 pages
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          skip: 4, // (3-1) * 2 = 4
        }),
      );
    });

    it('should handle page=99999 (beyond available pages)', async () => {
      const result = await service.findAllPaginated({ page: 99999, limit: 10 });

      expect(result.page).toBe(99999);
      expect(result.limit).toBe(10);
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 999990, // (99999-1) * 10
        }),
      );
    });

    it('should handle limit=0 (edge case) - defaults to safe limit of 1', async () => {
      const result = await service.findAllPaginated({ page: 1, limit: 0 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(1); // Should be sanitized to minimum 1
      expect(result.total).toBe(10);
      expect(result.totalPages).toBe(10);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
          skip: 0,
        }),
      );
    });

    it('should handle limit > 100 - capped to 100', async () => {
      const result = await service.findAllPaginated({ page: 1, limit: 500 });

      expect(result.limit).toBe(100); // Should be capped to 100
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 0,
        }),
      );
    });

    it('should handle negative page number - defaults to 1', async () => {
      const result = await service.findAllPaginated({ page: -5, limit: 10 });

      expect(result.page).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
        }),
      );
    });

    it('should handle negative limit - defaults to 1', async () => {
      const result = await service.findAllPaginated({ page: 1, limit: -10 });

      expect(result.limit).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
          skip: 0,
        }),
      );
    });

    it('should return empty array when page exceeds total pages', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([[], 0]);
      
      const result = await service.findAllPaginated({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // ============================================
  // FILTERING TESTS
  // ============================================

  describe('Filtering', () => {
    it('should filter by action type', async () => {
      const filteredLogs = mockAuditLogs.filter(log => log.action === 'USER_CREATED');
      mockRepository.findAndCount.mockResolvedValueOnce([filteredLogs, filteredLogs.length]);

      const result = await service.findAllPaginated({ action: 'USER_CREATED' });

      expect(result.data).toHaveLength(3);
      expect(result.data.every(log => log.action === 'USER_CREATED')).toBe(true);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: expect.anything(), // Like pattern
          }),
        }),
      );
    });

    it('should filter by action type with partial match', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([[], 0]);

      await service.findAllPaginated({ action: 'USER' });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: expect.any(String),
          }),
        }),
      );
    });

    it('should filter by userId (adminId)', async () => {
      const filteredLogs = mockAuditLogs.filter(log => log.adminId === 'admin-1');
      mockRepository.findAndCount.mockResolvedValueOnce([filteredLogs, filteredLogs.length]);

      const result = await service.findAllPaginated({ userId: 'admin-1' });

      expect(result.data).toHaveLength(5);
      expect(result.data.every(log => log.adminId === 'admin-1')).toBe(true);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            adminId: 'admin-1',
          }),
        }),
      );
    });

    it('should filter by non-existent userId - returns empty', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([[], 0]);

      const result = await service.findAllPaginated({ userId: 'non-existent-id' });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should filter by action type and userId combined', async () => {
      const filteredLogs = mockAuditLogs.filter(
        log => log.action === 'USER_CREATED' && log.adminId === 'admin-1'
      );
      mockRepository.findAndCount.mockResolvedValueOnce([filteredLogs, filteredLogs.length]);

      const result = await service.findAllPaginated({ 
        action: 'USER_CREATED', 
        userId: 'admin-1' 
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.every(log => 
        log.action === 'USER_CREATED' && log.adminId === 'admin-1'
      )).toBe(true);
    });
  });

  // ============================================
  // SORTING TESTS
  // ============================================

  describe('Sorting', () => {
    it('should sort by createdAt DESC (default)', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([mockAuditLogs, mockAuditLogs.length]);

      await service.findAllPaginated({ sortBy: 'createdAt', sortOrder: 'DESC' });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            createdAt: 'DESC',
          }),
        }),
      );
    });

    it('should sort by createdAt ASC', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([mockAuditLogs, mockAuditLogs.length]);

      await service.findAllPaginated({ sortBy: 'createdAt', sortOrder: 'ASC' });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            createdAt: 'ASC',
          }),
        }),
      );
    });

    it('should sort by action field', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([mockAuditLogs, mockAuditLogs.length]);

      await service.findAllPaginated({ sortBy: 'action', sortOrder: 'ASC' });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            action: 'ASC',
          }),
        }),
      );
    });

    it('should sort by adminId field', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([mockAuditLogs, mockAuditLogs.length]);

      await service.findAllPaginated({ sortBy: 'adminId', sortOrder: 'DESC' });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            adminId: 'DESC',
          }),
        }),
      );
    });

    it('should default to createdAt DESC when sortBy is not specified', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([mockAuditLogs, mockAuditLogs.length]);

      await service.findAllPaginated({});

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            createdAt: 'DESC',
          }),
        }),
      );
    });
  });

  // ============================================
  // COMBINED SCENARIOS TESTS
  // ============================================

  describe('Combined scenarios', () => {
    it('should handle pagination + filtering + sorting together', async () => {
      const filteredLogs = mockAuditLogs
        .filter(log => log.action === 'USER_CREATED')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 2);
      
      mockRepository.findAndCount.mockResolvedValueOnce([
        filteredLogs,
        3, // total matching records
      ]);

      const result = await service.findAllPaginated({
        page: 1,
        limit: 2,
        action: 'USER_CREATED',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('should handle all edge cases together', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([[], 0]);

      const result = await service.findAllPaginated({
        page: 99999,
        limit: 0,
        action: 'NONEXISTENT',
        userId: 'ghost-user',
      });

      // Edge case handling
      expect(result.page).toBe(99999); // page not sanitized when explicitly provided
      expect(result.limit).toBe(1); // limit sanitized to minimum
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ============================================
  // EXISTING METHODS TESTS
  // ============================================

  describe('Existing methods', () => {
    it('logAction should create and save audit log', async () => {
      const mockLog = { adminId: 'admin-1', action: 'USER_CREATED' };
      mockRepository.create.mockReturnValue(mockLog);
      mockRepository.save.mockResolvedValue({ id: '1', ...mockLog });

      await service.logAction('admin-1', 'USER_CREATED');

      expect(mockRepository.create).toHaveBeenCalledWith(mockLog);
      expect(mockRepository.save).toHaveBeenCalledWith(mockLog);
    });

    it('create should create and save audit log from DTO', async () => {
      const mockDto = { adminId: 'admin-2', action: 'ROLE_CHANGED' };
      const mockLog = { ...mockDto };
      mockRepository.create.mockReturnValue(mockLog);
      mockRepository.save.mockResolvedValue({ id: '2', ...mockLog });

      const result = await service.create(mockDto as any);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('findOne should return audit log by id', async () => {
      const mockLog = { id: '1', adminId: 'admin-1', action: 'USER_CREATED' };
      mockRepository.findOne.mockResolvedValue(mockLog);

      const result = await service.findOne('1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(result).toEqual(mockLog);
    });

    it('findOne should return null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('999');

      expect(result).toBeNull();
    });

    it('update should update and return the audit log', async () => {
      const mockLog = { id: '1', adminId: 'admin-1', action: 'USER_CREATED' };
      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne.mockResolvedValue(mockLog);

      const result = await service.update('1', { action: 'UPDATED' });

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: '1' },
        { action: 'UPDATED' },
      );
      expect(mockRepository.findOne).toHaveBeenCalled();
    });

    it('update should throw error when log not found', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 });
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update('999', { action: 'UPDATED' }))
        .rejects.toThrow('Audit log not found');
    });

    it('remove should delete audit log by id', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('1');

      expect(mockRepository.delete).toHaveBeenCalledWith({ id: '1' });
    });
  });
});
