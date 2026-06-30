import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository, LessThanOrEqual } from 'typeorm';
import { ReminderService } from './reminder.service';
import { TaskReminder, ReminderStatus, ReminderType } from '../../../database/entities/task-reminder.entity';
import { NotificationService } from '../../../notifications/services/notification.service';
import { HealthTask } from '../../../entities/health-task.entity';

describe('ReminderService', () => {
  let service: ReminderService;
  let reminderRepo: Repository<TaskReminder>;
  let taskRepo: Repository<HealthTask>;
  let notificationService: NotificationService;

  const mockReminderRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockTaskRepo = {
    findOne: jest.fn(),
  };

  const mockNotificationService = {
    sendEmail: jest.fn(),
    sendSMS: jest.fn(),
    sendPush: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        {
          provide: getRepositoryToken(TaskReminder),
          useValue: mockReminderRepo,
        },
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockTaskRepo,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
    reminderRepo = module.get<Repository<TaskReminder>>(
      getRepositoryToken(TaskReminder),
    );
    taskRepo = module.get<Repository<HealthTask>>(
      getRepositoryToken(HealthTask),
    );
    notificationService = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setReminder', () => {
    const taskId = 'task-1';
    const userId = 'user-1';
    const remindAt = new Date('2026-06-28T10:00:00Z');

    it('should create a reminder with default type (PUSH)', async () => {
      const mockTask = { id: taskId, title: 'Test Task' };
      const mockReminder = {
        id: 'reminder-1',
        taskId,
        userId,
        remindAt,
        type: ReminderType.PUSH,
        status: ReminderStatus.SCHEDULED,
      };

      mockTaskRepo.findOne.mockResolvedValue(mockTask);
      mockReminderRepo.create.mockReturnValue(mockReminder);
      mockReminderRepo.save.mockResolvedValue(mockReminder);

      const result = await service.setReminder(taskId, userId, remindAt);

      expect(result).toEqual(mockReminder);
      expect(mockTaskRepo.findOne).toHaveBeenCalledWith({ where: { id: taskId } });
      expect(mockReminderRepo.create).toHaveBeenCalledWith({
        taskId,
        userId,
        remindAt,
        type: ReminderType.PUSH,
        status: ReminderStatus.SCHEDULED,
      });
      expect(mockReminderRepo.save).toHaveBeenCalledWith(mockReminder);
    });

    it('should create a reminder with specified type', async () => {
      const mockTask = { id: taskId, title: 'Test Task' };
      const mockReminder = {
        id: 'reminder-1',
        taskId,
        userId,
        remindAt,
        type: ReminderType.EMAIL,
        status: ReminderStatus.SCHEDULED,
      };

      mockTaskRepo.findOne.mockResolvedValue(mockTask);
      mockReminderRepo.create.mockReturnValue(mockReminder);
      mockReminderRepo.save.mockResolvedValue(mockReminder);

      const result = await service.setReminder(taskId, userId, remindAt, ReminderType.EMAIL);

      expect(result.type).toBe(ReminderType.EMAIL);
      expect(mockReminderRepo.create).toHaveBeenCalledWith({
        taskId,
        userId,
        remindAt,
        type: ReminderType.EMAIL,
        status: ReminderStatus.SCHEDULED,
      });
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setReminder(taskId, userId, remindAt),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelReminder', () => {
    it('should cancel a scheduled reminder', async () => {
      const reminder = {
        id: 'reminder-1',
        status: ReminderStatus.SCHEDULED,
      };

      mockReminderRepo.findOne.mockResolvedValue(reminder);
      mockReminderRepo.save.mockResolvedValue({ ...reminder, status: ReminderStatus.CANCELLED });

      await service.cancelReminder('reminder-1');

      expect(reminder.status).toBe(ReminderStatus.CANCELLED);
      expect(mockReminderRepo.save).toHaveBeenCalledWith(reminder);
    });

    it('should throw NotFoundException if reminder does not exist', async () => {
      mockReminderRepo.findOne.mockResolvedValue(null);

      await expect(service.cancelReminder('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('processDueReminders', () => {
    const baseReminder = (overrides: Partial<TaskReminder> = {}): TaskReminder => ({
      id: 'reminder-1',
      taskId: 'task-1',
      userId: 'user-1',
      remindAt: new Date('2026-06-27T00:00:00Z'),
      type: ReminderType.PUSH,
      status: ReminderStatus.SCHEDULED,
      deliveryTracking: null,
      task: { id: 'task-1', title: 'Test Task' } as HealthTask,
      user: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    });

    it('should find and process due reminders', async () => {
      const dueReminders = [baseReminder()];
      mockReminderRepo.find.mockResolvedValue(dueReminders);
      mockNotificationService.sendPush.mockResolvedValue(true);
      mockReminderRepo.save.mockImplementation(async (r) => r);

      const processedCount = await service.processDueReminders();

      expect(processedCount).toBe(1);
      expect(mockReminderRepo.find).toHaveBeenCalledWith({
        where: {
          status: ReminderStatus.SCHEDULED,
          remindAt: LessThanOrEqual(expect.any(Date)),
        },
        relations: ['task'],
      });
      expect(mockNotificationService.sendPush).toHaveBeenCalledWith(
        'user-1',
        'Task Reminder',
        'Time to work on your task: Test Task',
      );
    });

    it('should dispatch EMAIL reminders via notificationService.sendEmail', async () => {
      const emailReminder = baseReminder({
        id: 'reminder-email',
        type: ReminderType.EMAIL,
      });
      mockReminderRepo.find.mockResolvedValue([emailReminder]);
      mockNotificationService.sendEmail.mockResolvedValue(true);
      mockReminderRepo.save.mockImplementation(async (r) => r);

      await service.processDueReminders();

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        'user-1',
        'task-reminder',
        {
          taskTitle: 'Test Task',
          remindAt: emailReminder.remindAt,
        },
      );
    });

    it('should dispatch SMS reminders via notificationService.sendSMS', async () => {
      const smsReminder = baseReminder({
        id: 'reminder-sms',
        type: ReminderType.SMS,
      });
      mockReminderRepo.find.mockResolvedValue([smsReminder]);
      mockNotificationService.sendSMS.mockResolvedValue(true);
      mockReminderRepo.save.mockImplementation(async (r) => r);

      await service.processDueReminders();

      expect(mockNotificationService.sendSMS).toHaveBeenCalledWith(
        'user-1',
        'Reminder: Your health task "Test Task" is due now!',
      );
    });

    it('should fall back to "Health Task" title when task is missing', async () => {
      const reminderNoTask = baseReminder({ task: null });
      mockReminderRepo.find.mockResolvedValue([reminderNoTask]);
      mockNotificationService.sendPush.mockResolvedValue(true);
      mockReminderRepo.save.mockImplementation(async (r) => r);

      await service.processDueReminders();

      expect(mockNotificationService.sendPush).toHaveBeenCalledWith(
        'user-1',
        'Task Reminder',
        'Time to work on your task: Health Task',
      );
    });

    it('should mark reminder as SENT on successful dispatch', async () => {
      const reminder = baseReminder();
      mockReminderRepo.find.mockResolvedValue([reminder]);
      mockNotificationService.sendPush.mockResolvedValue(true);
      mockReminderRepo.save.mockImplementation(async (r) => r);

      await service.processDueReminders();

      expect(reminder.status).toBe(ReminderStatus.SENT);
      expect(reminder.deliveryTracking).toEqual({
        sentAt: expect.any(Date),
        status: 'delivered',
      });
    });

    it('should mark reminder as FAILED when notification service returns false', async () => {
      const reminder = baseReminder();
      mockReminderRepo.find.mockResolvedValue([reminder]);
      mockNotificationService.sendPush.mockResolvedValue(false);
      mockReminderRepo.save.mockImplementation(async (r) => r);

      await service.processDueReminders();

      expect(reminder.status).toBe(ReminderStatus.FAILED);
      expect(reminder.deliveryTracking).toEqual({
        sentAt: expect.any(Date),
        status: 'failed_by_notification_service',
      });
    });

    it('should handle exceptions during send and mark reminder as FAILED with error tracking', async () => {
      const reminder = baseReminder();
      mockReminderRepo.find.mockResolvedValue([reminder]);
      mockNotificationService.sendPush.mockRejectedValue(new Error('Network error'));
      mockReminderRepo.save.mockImplementation(async (r) => r);

      const processedCount = await service.processDueReminders();

      expect(processedCount).toBe(0);
      expect(reminder.status).toBe(ReminderStatus.FAILED);
      expect(reminder.deliveryTracking).toEqual({
        error: 'Network error',
        timestamp: expect.any(Date),
      });
    });

    it('should return 0 when no due reminders exist', async () => {
      mockReminderRepo.find.mockResolvedValue([]);

      const result = await service.processDueReminders();

      expect(result).toBe(0);
      expect(mockNotificationService.sendPush).not.toHaveBeenCalled();
    });
  });

  describe('getRemindersForTask', () => {
    it('should return reminders for a task ordered by remindAt ascending', async () => {
      const reminders = [
        { id: 'r1', taskId: 'task-1', remindAt: new Date('2026-06-27T10:00:00Z') },
        { id: 'r2', taskId: 'task-1', remindAt: new Date('2026-06-28T10:00:00Z') },
      ];

      mockReminderRepo.find.mockResolvedValue(reminders);

      const result = await service.getRemindersForTask('task-1');

      expect(result).toEqual(reminders);
      expect(mockReminderRepo.find).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
        order: { remindAt: 'ASC' },
      });
    });
  });

  describe('deleteReminder', () => {
    it('should delete a reminder by ID', async () => {
      mockReminderRepo.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.deleteReminder('reminder-1');

      expect(mockReminderRepo.delete).toHaveBeenCalledWith('reminder-1');
    });
  });
});
