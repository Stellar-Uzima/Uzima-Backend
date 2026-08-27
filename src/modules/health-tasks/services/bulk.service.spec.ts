import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BulkTaskService } from './bulk.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { BadRequestException } from '@nestjs/common';

describe('BulkTaskService', () => {
  let service: BulkTaskService;

  const mockExec = jest.fn().mockResolvedValue({ affected: 2 });
  const mockWhereIn = jest.fn().mockReturnValue({ execute: mockExec });
  const mockSet = jest.fn().mockReturnValue({ whereInIds: mockWhereIn });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockQb: any = { update: mockUpdate };
  const mockRepo = {
    createQueryBuilder: jest.fn(() => mockQb),
    find: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSet.mockReturnValue({ whereInIds: mockWhereIn });
    mockWhereIn.mockReturnValue({ execute: mockExec });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkTaskService,
        { provide: getRepositoryToken(HealthTask), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<BulkTaskService>(BulkTaskService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('bulkUpdateStatus returns affected count and ids', async () => {
    const result = await service.bulkUpdateStatus(['id1', 'id2'], 'done');
    expect(result).toEqual({ affected: 2, ids: ['id1', 'id2'] });
  });

  it('bulkDelete removes tasks and returns count', async () => {
    const tasks = [{ id: 'id1' }, { id: 'id2' }];
    mockRepo.find.mockResolvedValue(tasks);
    mockRepo.remove.mockResolvedValue(tasks);
    const result = await service.bulkDelete(['id1', 'id2']);
    expect(result.affected).toBe(2);
  });

  it('bulkUpdateStatus throws BadRequestException on empty ids array', async () => {
    await expect(service.bulkUpdateStatus([], 'done')).rejects.toThrow(BadRequestException);
  });
});
