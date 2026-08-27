import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityLogService } from './activity-log.service';
import { TaskActivity } from '../../../database/entities/task-activity.entity';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  const mockRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: getRepositoryToken(TaskActivity), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<ActivityLogService>(ActivityLogService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('logTaskChange creates and saves an activity entry', async () => {
    const entry = { taskId: 't1', changedBy: 'u1', changeType: 'status', details: {} };
    mockRepo.create.mockReturnValue(entry);
    mockRepo.save.mockResolvedValue({ id: 'a1', ...entry });
    const result = await service.logTaskChange('t1', 'u1', 'status', {});
    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1', changedBy: 'u1' }));
    expect(result).toHaveProperty('id', 'a1');
  });

  it('getActivityHistory fetches entries with DESC order and pagination', async () => {
    mockRepo.find.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const result = await service.getActivityHistory('t1', 5, 10);
    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: 't1' }, order: { createdAt: 'DESC' }, skip: 10, take: 5 }),
    );
    expect(result).toHaveLength(2);
  });
});
