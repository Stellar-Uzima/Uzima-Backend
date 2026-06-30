import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskFilterService } from './task-filter.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

describe('TaskFilterService', () => {
  let service: TaskFilterService;

  const mockQb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const mockRepo = { createQueryBuilder: jest.fn(() => mockQb) };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.assign(mockQb, { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[], 0]) });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskFilterService,
        { provide: getRepositoryToken(HealthTask), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<TaskFilterService>(TaskFilterService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('filter returns data and total from getManyAndCount', async () => {
    mockQb.getManyAndCount.mockResolvedValue([[{ id: 't1' }], 1]);
    const result = await service.filter({ status: 'active' });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('total', 1);
  });

  it('filter with dateFrom and dateTo calls andWhere', async () => {
    await service.filter({ dateFrom: new Date('2024-01-01'), dateTo: new Date('2024-12-31') });
    expect(mockQb.andWhere).toHaveBeenCalled();
  });

  it('savePreset stores preset and getPreset retrieves it', () => {
    service.savePreset('morning', 'user1', { status: 'active' });
    const preset = service.getPreset('morning', 'user1');
    expect(preset).not.toBeNull();
    expect(preset?.filters.status).toBe('active');
  });

  it('getPreset returns null for unknown preset', () => {
    expect(service.getPreset('nonexistent', 'user1')).toBeNull();
  });
});
