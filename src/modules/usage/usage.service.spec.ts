import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsageService } from './usage.service';
import { Usage } from './entities/usage.entity';
import { NotificationsService } from '../../notifications/notifications.service';

describe('UsageService', () => {
  let service: UsageService;

  const mockRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn() };
  const mockNotif = new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: getRepositoryToken(Usage), useValue: mockRepo },
        { provide: NotificationsService, useValue: mockNotif },
      ],
    }).compile();
    service = module.get<UsageService>(UsageService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('trackUsage creates and saves a usage record', async () => {
    mockRepo.create.mockReturnValue({ userId: 1, event: 'login', amount: 1 });
    mockRepo.save.mockResolvedValue({ id: 1 });
    mockRepo.find.mockResolvedValue([]);
    await service.trackUsage(1, 'login', 1);
    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, event: 'login' }));
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('getUsage returns records filtered by userId and event', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1, event: 'login', userId: 1 }]);
    const result = await service.getUsage(1, 'login');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('event', 'login');
  });

  it('getUsage without event returns all records for user', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const result = await service.getUsage(1);
    expect(result).toHaveLength(2);
  });
});
