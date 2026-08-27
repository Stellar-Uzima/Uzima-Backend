import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskNotificationsService } from './task-notifications.service';
import { Notification } from '../../../notifications/entities/notification.entity';
import { NotificationPreference } from '../../../notifications/entities/notification-preference.entity';

describe('TaskNotificationsService', () => {
  let service: TaskNotificationsService;

  const mockNotifRepo = { create: jest.fn(), save: jest.fn() };
  const mockPrefRepo  = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskNotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockNotifRepo },
        { provide: getRepositoryToken(NotificationPreference), useValue: mockPrefRepo },
      ],
    }).compile();
    service = module.get<TaskNotificationsService>(TaskNotificationsService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('getDeliveryLog returns empty array initially', () => {
    expect(service.getDeliveryLog('u1')).toEqual([]);
  });

  it('notifyDueSoon resolves without error', async () => {
    mockPrefRepo.findOne.mockResolvedValue(null);
    mockNotifRepo.create.mockReturnValue({});
    mockNotifRepo.save.mockResolvedValue({ id: 'n1' });
    const task = { id: 't1', title: 'Walk', xlmReward: 0 } as any;
    await expect(service.notifyDueSoon(task, 'u1')).resolves.not.toThrow();
  });

  it('notifyCompleted resolves without error', async () => {
    mockPrefRepo.findOne.mockResolvedValue(null);
    mockNotifRepo.create.mockReturnValue({});
    mockNotifRepo.save.mockResolvedValue({ id: 'n2' });
    const task = { id: 't2', title: 'Run', xlmReward: 5 } as any;
    await expect(service.notifyCompleted(task, 'u1')).resolves.not.toThrow();
  });

  it('notifyOverdue resolves without error', async () => {
    mockPrefRepo.findOne.mockResolvedValue(null);
    mockNotifRepo.create.mockReturnValue({});
    mockNotifRepo.save.mockResolvedValue({ id: 'n3' });
    const task = { id: 't3', title: 'Overdue task', xlmReward: 0 } as any;
    await expect(service.notifyOverdue(task, 'u1')).resolves.not.toThrow();
  });
});
