import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { NotificationCenterService } from './notification-center.service';
import { ChannelRouterService } from './channel-router.service';
import { InAppNotification, NotificationTypeEnum, DeliveryChannel } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog, DeliveryStatus } from './entities/notification-delivery-log.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../database/entities/user.entity';
import { SendNotificationDto } from './dto/send-notification.dto';
import { GetInboxDto } from './dto/get-inbox.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const makeNotification = (overrides: Partial<InAppNotification> = {}): InAppNotification =>
  ({
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationTypeEnum.TASK_REMINDER,
    title: 'Test title',
    body: 'Test body',
    data: null,
    readAt: null,
    deliveredChannels: [DeliveryChannel.IN_APP],
    createdAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  } as InAppNotification);

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'test@example.com',
    phone: '+2348012345678',
    fcmToken: 'fcm-token-xyz',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  } as unknown as User);

const makePreference = (overrides: Partial<NotificationPreference> = {}): NotificationPreference =>
  ({
    userId: 'user-1',
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
    ...overrides,
  } as unknown as NotificationPreference);

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationCenterService', () => {
  let service: NotificationCenterService;
  let mockNotificationRepo: any;
  let mockDeliveryLogRepo: any;
  let mockPreferenceRepo: any;
  let mockUserRepo: any;
  let mockChannelRouter: any;

  beforeEach(async () => {
    const notification = makeNotification();
    const user = makeUser();
    const preference = makePreference();

    // Provide a queryBuilder that returns results needed by getInbox / markAllRead
    const mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
      getManyAndCount: jest.fn().mockResolvedValue([[notification], 1]),
    };

    mockNotificationRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...notification, ...dto })),
      save: jest.fn().mockImplementation((n) => Promise.resolve({ ...notification, ...n })),
      findOne: jest.fn().mockResolvedValue(notification),
      count: jest.fn().mockResolvedValue(5),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    mockDeliveryLogRepo = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      find: jest.fn(),
    };

    mockPreferenceRepo = {
      findOne: jest.fn().mockResolvedValue(preference),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(user),
    };

    mockChannelRouter = {
      route: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationCenterService,
        {
          provide: getRepositoryToken(InAppNotification),
          useValue: mockNotificationRepo,
        },
        {
          provide: getRepositoryToken(NotificationDeliveryLog),
          useValue: mockDeliveryLogRepo,
        },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferenceRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: ChannelRouterService,
          useValue: mockChannelRouter,
        },
      ],
    }).compile();

    service = module.get<NotificationCenterService>(NotificationCenterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── sendNotification ────────────────────────────────────────────────────

  describe('sendNotification', () => {
    const dto: SendNotificationDto = {
      userId: 'user-1',
      type: NotificationTypeEnum.TASK_REMINDER,
      title: 'Task reminder',
      body: 'Your task is due soon.',
    };

    it('creates and returns an in-app notification', async () => {
      const result = await service.sendNotification(dto);

      expect(mockNotificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationTypeEnum.TASK_REMINDER,
          title: 'Task reminder',
          body: 'Your task is due soon.',
          readAt: null,
          deliveredChannels: ['in_app'],
        }),
      );
      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('always creates in-app record even if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.sendNotification(dto);

      expect(result).toBeDefined();
      expect(mockNotificationRepo.save).toHaveBeenCalled();
      // Channel router should NOT have been called
      expect(mockChannelRouter.route).not.toHaveBeenCalled();
    });

    it('routes to all enabled channels when user exists', async () => {
      await service.sendNotification(dto);

      // Wait a tick for the fire-and-forget promise
      await new Promise((r) => setImmediate(r));

      expect(mockChannelRouter.route).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: 'user-1' }),
          preferences: expect.objectContaining({ emailNotifications: true }),
        }),
      );
    });

    it('correctly routes when user preferences disable push', async () => {
      mockPreferenceRepo.findOne.mockResolvedValueOnce(
        makePreference({ pushNotifications: false }),
      );

      await service.sendNotification(dto);
      await new Promise((r) => setImmediate(r));

      expect(mockChannelRouter.route).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: expect.objectContaining({ pushNotifications: false }),
        }),
      );
    });
  });

  // ─── getInbox ────────────────────────────────────────────────────────────

  describe('getInbox', () => {
    it('returns paginated notifications with unread count', async () => {
      const query: GetInboxDto = { page: 1, limit: 20 };
      const result = await service.getInbox('user-1', query);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.unreadCount).toBe(5);
    });

    it('applies correct pagination offsets', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();
      const query: GetInboxDto = { page: 3, limit: 10 };

      await service.getInbox('user-1', query);

      expect(mockQb.skip).toHaveBeenCalledWith(20); // (3-1) * 10
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });

    it('orders by unread-first then by createdAt DESC', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();
      await service.getInbox('user-1', { page: 1, limit: 20 });

      expect(mockQb.orderBy).toHaveBeenCalledWith(
        expect.stringContaining('readAt'),
        'ASC',
      );
      expect(mockQb.addOrderBy).toHaveBeenCalledWith('n.createdAt', 'DESC');
    });
  });

  // ─── getUnreadCount ──────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('uses a COUNT query (not fetch all) and returns the count', async () => {
      mockNotificationRepo.count.mockResolvedValueOnce(7);
      const result = await service.getUnreadCount('user-1');

      expect(result.count).toBe(7);
      expect(mockNotificationRepo.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: IsNull() },
      });
    });

    it('returns 0 when no unread notifications exist', async () => {
      mockNotificationRepo.count.mockResolvedValueOnce(0);
      const result = await service.getUnreadCount('user-1');
      expect(result.count).toBe(0);
    });
  });

  // ─── markRead ────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('sets readAt on an unread notification and returns the DTO', async () => {
      const unread = makeNotification({ readAt: null });
      mockNotificationRepo.findOne.mockResolvedValueOnce(unread);

      const result = await service.markRead('user-1', 'notif-1');

      expect(mockNotificationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ readAt: expect.any(Date) }),
      );
      expect(result.id).toBe('notif-1');
    });

    it('is idempotent — does not re-save an already-read notification', async () => {
      const alreadyRead = makeNotification({ readAt: new Date() });
      mockNotificationRepo.findOne.mockResolvedValueOnce(alreadyRead);

      await service.markRead('user-1', 'notif-1');

      expect(mockNotificationRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when notification does not belong to user', async () => {
      mockNotificationRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.markRead('user-1', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── markAllRead ─────────────────────────────────────────────────────────

  describe('markAllRead', () => {
    it('executes a single bulk UPDATE and returns the count', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();
      mockQb.execute.mockResolvedValueOnce({ affected: 12 });

      const result = await service.markAllRead('user-1');

      expect(result.updated).toBe(12);
      // Only one UPDATE call — not N individual saves
      expect(mockNotificationRepo.save).not.toHaveBeenCalled();
    });

    it('handles zero unread notifications gracefully', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();
      mockQb.execute.mockResolvedValueOnce({ affected: 0 });

      const result = await service.markAllRead('user-1');
      expect(result.updated).toBe(0);
    });

    it('marks 50 unread notifications in one operation', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();
      mockQb.execute.mockResolvedValueOnce({ affected: 50 });

      const result = await service.markAllRead('user-1');
      expect(result.updated).toBe(50);

      // Confirm it used createQueryBuilder (bulk UPDATE), not individual saves
      expect(mockNotificationRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockNotificationRepo.save).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ChannelRouterService unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ChannelRouterService — channel routing', () => {
  let channelRouter: ChannelRouterService;
  let mockPreferenceRepo: any;
  let mockUserRepo: any;
  let mockDeliveryLogRepo: any;
  let mockRetryQueue: any;
  let mockSmsService: any;
  let mockPushNotificationService: any;
  let mockEmailTemplateService: any;

  const user = makeUser();
  const notification = makeNotification();

  beforeEach(async () => {
    const savedLog = {
      id: 'log-1',
      notificationId: notification.id,
      channel: DeliveryChannel.EMAIL,
      status: DeliveryStatus.PENDING,
      attempts: 0,
      attemptedAt: null,
      errorMessage: null,
      createdAt: new Date(),
    } as NotificationDeliveryLog;

    // mock queryBuilder for markChannelDelivered
    const mockQbManager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };

    mockPreferenceRepo = { findOne: jest.fn() };
    mockUserRepo = { findOne: jest.fn().mockResolvedValue(user) };
    mockDeliveryLogRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...savedLog, ...dto })),
      save: jest.fn().mockImplementation((l) => Promise.resolve({ ...savedLog, ...l })),
      update: jest.fn().mockResolvedValue({}),
      manager: mockQbManager,
    };
    mockRetryQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    mockSmsService = {
      sendSms: jest.fn().mockResolvedValue(undefined),
    };
    mockPushNotificationService = {
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };
    mockEmailTemplateService = {
      render: jest.fn().mockResolvedValue('<html>template</html>'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ChannelRouterService,
          useFactory: () => {
            const { ChannelRouterService: CRS } = require('./channel-router.service');
            return new CRS(
              mockPreferenceRepo,
              mockUserRepo,
              mockDeliveryLogRepo,
              mockRetryQueue,
              mockSmsService,
              mockPushNotificationService,
              mockEmailTemplateService,
            );
          },
        },
      ],
    }).compile();

    channelRouter = module.get<ChannelRouterService>(ChannelRouterService);
  });

  it('dispatches email when emailNotifications is enabled', async () => {
    const prefs = makePreference({ emailNotifications: true, pushNotifications: false, smsNotifications: false });

    await channelRouter.route({ notification, user, preferences: prefs });

    expect(mockEmailTemplateService.render).toHaveBeenCalled();
    expect(mockPushNotificationService.sendPushNotification).not.toHaveBeenCalled();
    expect(mockSmsService.sendSms).not.toHaveBeenCalled();
  });

  it('does NOT enqueue push or SMS jobs when those channels are disabled', async () => {
    const prefs = makePreference({ emailNotifications: true, pushNotifications: false, smsNotifications: false });

    await channelRouter.route({ notification, user, preferences: prefs });

    // Retry queue should not have been called for push or sms
    const queueCalls: Array<any[]> = (mockRetryQueue.add as jest.Mock).mock.calls;
    const channels = queueCalls.map((args) => args[1]?.channel);
    expect(channels).not.toContain(DeliveryChannel.PUSH);
    expect(channels).not.toContain(DeliveryChannel.SMS);
  });

  it('enqueues retry job on initial delivery failure', async () => {
    mockEmailTemplateService.render.mockRejectedValueOnce(new Error('SMTP down'));

    const prefs = makePreference({ emailNotifications: true, pushNotifications: false, smsNotifications: false });
    await channelRouter.route({ notification, user, preferences: prefs });

    expect(mockRetryQueue.add).toHaveBeenCalledWith(
      'retry-channel-delivery',
      expect.objectContaining({
        channel: DeliveryChannel.EMAIL,
        attempt: 2,
        notificationId: notification.id,
      }),
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });

  it('marks delivery log as failed after max retries exceeded', async () => {
    mockEmailTemplateService.render.mockRejectedValue(new Error('Persistent failure'));

    const retryData = {
      notificationId: notification.id,
      logId: 'log-1',
      channel: DeliveryChannel.EMAIL,
      userId: user.id,
      title: notification.title,
      body: notification.body,
      attempt: 3, // max attempts
    };

    await channelRouter.retryDelivery(retryData);

    expect(mockDeliveryLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: DeliveryStatus.FAILED }),
    );
    // Should NOT enqueue another retry after max
    expect(mockRetryQueue.add).not.toHaveBeenCalled();
  });

  it('marks delivery log as sent and updates deliveredChannels on success', async () => {
    mockEmailTemplateService.render.mockResolvedValue('<html>ok</html>');

    const retryData = {
      notificationId: notification.id,
      logId: 'log-1',
      channel: DeliveryChannel.EMAIL,
      userId: user.id,
      title: notification.title,
      body: notification.body,
      attempt: 2,
    };

    await channelRouter.retryDelivery(retryData);

    expect(mockDeliveryLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: DeliveryStatus.SENT }),
    );
  });

  it('retries email up to 3 times with exponential backoff — 2nd attempt succeeds', async () => {
    // Scenario: fails attempt 1, fails attempt 2, succeeds attempt 3
    mockEmailTemplateService.render
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValueOnce('<html>ok</html>');

    const prefs = makePreference({ emailNotifications: true, pushNotifications: false, smsNotifications: false });

    // Initial attempt (1) — fails, enqueues retry at attempt 2
    await channelRouter.route({ notification, user, preferences: prefs });

    expect(mockRetryQueue.add).toHaveBeenCalledWith(
      'retry-channel-delivery',
      expect.objectContaining({ attempt: 2 }),
      expect.objectContaining({ delay: 2000 }), // 1000 * 2^1
    );

    // Retry attempt 2 — fails, enqueues retry at attempt 3
    const attempt2Data = (mockRetryQueue.add as jest.Mock).mock.calls[0][1] as any;
    // Reset queue mock to capture next call
    mockRetryQueue.add.mockClear();

    await channelRouter.retryDelivery(attempt2Data);
    expect(mockRetryQueue.add).toHaveBeenCalledWith(
      'retry-channel-delivery',
      expect.objectContaining({ attempt: 3 }),
      expect.objectContaining({ delay: 4000 }), // 1000 * 2^2
    );

    // Retry attempt 3 — succeeds, final status = sent
    const attempt3Data = (mockRetryQueue.add as jest.Mock).mock.calls[0][1] as any;
    mockRetryQueue.add.mockClear();
    await channelRouter.retryDelivery(attempt3Data);

    expect(mockDeliveryLogRepo.update).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ status: DeliveryStatus.SENT }),
    );
    expect(mockRetryQueue.add).not.toHaveBeenCalled(); // no more retries
  });
});
