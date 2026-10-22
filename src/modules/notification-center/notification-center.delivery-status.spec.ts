import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationCenterService } from './notification-center.service';
import { ChannelRouterService } from './channel-router.service';
import { InAppNotification, NotificationTypeEnum } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog, DeliveryStatus } from './entities/notification-delivery-log.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../entities/user.entity';

/**
 * Tests for delivery status tracking: getDeliveryStatus() and getDeliveryStatusHistory()
 */
describe('NotificationCenterService — Delivery Status Tracking', () => {
  let service: NotificationCenterService;
  let mockNotificationRepo: any;
  let mockDeliveryLogRepo: any;
  let mockPreferenceRepo: any;
  let mockUserRepo: any;

  const baseNotification: InAppNotification = {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationTypeEnum.TASK_REMINDER,
    title: 'Test notification',
    body: 'This is a test',
    data: { taskId: '123' },
    readAt: null,
    deliveredChannels: ['in_app'],
    createdAt: new Date('2024-10-22T10:00:00Z'),
    user: {} as User,
  };

  const makeLogs = (
    notificationId: string,
    overrides: Array<Partial<NotificationDeliveryLog>> = [],
  ): NotificationDeliveryLog[] => {
    const defaults: NotificationDeliveryLog[] = [
      {
        id: 'log-1',
        notificationId,
        channel: 'in_app',
        status: DeliveryStatus.SENT,
        attempts: 1,
        attemptedAt: new Date('2024-10-22T10:00:00Z'),
        errorMessage: null,
        escalatedAt: null,
        escalatedReason: null,
        retryHistory: [
          { attempt: 1, at: '2024-10-22T10:00:00Z', reason: 'SUCCESS' },
        ],
        createdAt: new Date('2024-10-22T10:00:00Z'),
        updatedAt: new Date('2024-10-22T10:00:00Z'),
      } as NotificationDeliveryLog,
      {
        id: 'log-2',
        notificationId,
        channel: 'email',
        status: DeliveryStatus.SENT,
        attempts: 2,
        attemptedAt: new Date('2024-10-22T10:05:00Z'),
        errorMessage: null,
        escalatedAt: null,
        escalatedReason: null,
        retryHistory: [
          { attempt: 1, at: '2024-10-22T10:00:30Z', reason: 'NETWORK' },
          { attempt: 2, at: '2024-10-22T10:05:00Z', reason: 'SUCCESS' },
        ],
        createdAt: new Date('2024-10-22T10:00:00Z'),
        updatedAt: new Date('2024-10-22T10:05:00Z'),
      } as NotificationDeliveryLog,
      {
        id: 'log-3',
        notificationId,
        channel: 'push',
        status: DeliveryStatus.FAILED,
        attempts: 3,
        attemptedAt: new Date('2024-10-22T10:10:00Z'),
        errorMessage: 'User has no FCM token registered',
        escalatedAt: null,
        escalatedReason: null,
        retryHistory: [
          {
            attempt: 1,
            at: '2024-10-22T10:00:30Z',
            reason: 'DESTINATION_UNAVAILABLE',
          },
          {
            attempt: 2,
            at: '2024-10-22T10:05:00Z',
            reason: 'DESTINATION_UNAVAILABLE',
          },
          {
            attempt: 3,
            at: '2024-10-22T10:10:00Z',
            reason: 'DESTINATION_UNAVAILABLE',
          },
        ],
        createdAt: new Date('2024-10-22T10:00:00Z'),
        updatedAt: new Date('2024-10-22T10:10:00Z'),
      } as NotificationDeliveryLog,
      {
        id: 'log-4',
        notificationId,
        channel: 'sms',
        status: DeliveryStatus.ESCALATED,
        attempts: 3,
        attemptedAt: new Date('2024-10-22T10:15:00Z'),
        errorMessage: 'RATE_LIMIT',
        escalatedAt: new Date('2024-10-22T10:20:00Z'),
        escalatedReason: 'Delivery exhausted all retry attempts without acknowledgement',
        retryHistory: [
          { attempt: 1, at: '2024-10-22T10:00:30Z', reason: 'RATE_LIMIT' },
          { attempt: 2, at: '2024-10-22T10:05:00Z', reason: 'RATE_LIMIT' },
          { attempt: 3, at: '2024-10-22T10:15:00Z', reason: 'RATE_LIMIT' },
        ],
        createdAt: new Date('2024-10-22T10:00:00Z'),
        updatedAt: new Date('2024-10-22T10:20:00Z'),
      } as NotificationDeliveryLog,
    ];

    // Apply overrides
    return defaults.map((log, index) => ({
      ...log,
      ...(overrides[index] || {}),
    }));
  };

  beforeEach(async () => {
    const mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[baseNotification], 1]),
    };

    mockNotificationRepo = {
      findOne: jest.fn().mockResolvedValue(baseNotification),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    mockDeliveryLogRepo = {
      find: jest.fn().mockResolvedValue(makeLogs('notif-1')),
      createQueryBuilder: jest.fn().mockReturnValue({
        whereInIds: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(makeLogs('notif-1')),
      }),
    };

    mockPreferenceRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(null),
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
          useValue: { route: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<NotificationCenterService>(NotificationCenterService);
  });

  describe('getDeliveryStatus', () => {
    it('should return comprehensive delivery status for a notification', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      expect(result).toBeDefined();
      expect(result.notificationId).toBe('notif-1');
      expect(result.userId).toBe('user-1');
      expect(result.channels).toHaveLength(4);
    });

    it('should include all four channels in the status response', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const channelNames = result.channels.map((c) => c.channel);
      expect(channelNames).toContain('in_app');
      expect(channelNames).toContain('email');
      expect(channelNames).toContain('push');
      expect(channelNames).toContain('sms');
    });

    it('should map delivery log data to channel status DTO correctly', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const emailChannel = result.channels.find((c) => c.channel === 'email');
      expect(emailChannel).toBeDefined();
      expect(emailChannel?.status).toBe(DeliveryStatus.SENT);
      expect(emailChannel?.attempts).toBe(2);
      expect(emailChannel?.lastAttemptedAt).toEqual(new Date('2024-10-22T10:05:00Z'));
      expect(emailChannel?.retryHistory).toHaveLength(2);
    });

    it('should calculate correct overall status — all_delivered', async () => {
      mockDeliveryLogRepo.find.mockResolvedValueOnce(
        makeLogs('notif-1', [
          { status: DeliveryStatus.SENT },
          { status: DeliveryStatus.SENT },
          { status: DeliveryStatus.SENT },
          { status: DeliveryStatus.SENT },
        ]),
      );

      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      expect(result.overallStatus).toBe('all_delivered');
      expect(result.successfulChannels).toHaveLength(4);
      expect(result.failedChannels).toHaveLength(0);
    });

    it('should calculate correct overall status — partially_delivered', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      // Mock data has 2 sent, 1 failed, 1 escalated
      expect(result.overallStatus).toBe('partially_delivered');
      expect(result.successfulChannels).toHaveLength(2);
      expect(result.failedChannels).toHaveLength(2);
    });

    it('should calculate correct overall status — all_failed', async () => {
      mockDeliveryLogRepo.find.mockResolvedValueOnce(
        makeLogs('notif-1', [
          { status: DeliveryStatus.FAILED },
          { status: DeliveryStatus.FAILED },
          { status: DeliveryStatus.FAILED },
          { status: DeliveryStatus.FAILED },
        ]),
      );

      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      expect(result.overallStatus).toBe('all_failed');
      expect(result.successfulChannels).toHaveLength(0);
      expect(result.failedChannels).toHaveLength(4);
    });

    it('should calculate correct overall status — all_pending', async () => {
      mockDeliveryLogRepo.find.mockResolvedValueOnce(
        makeLogs('notif-1', [
          { status: DeliveryStatus.PENDING },
          { status: DeliveryStatus.PENDING },
          { status: DeliveryStatus.PENDING },
          { status: DeliveryStatus.PENDING },
        ]),
      );

      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      expect(result.overallStatus).toBe('all_pending');
      expect(result.successfulChannels).toHaveLength(0);
      expect(result.failedChannels).toHaveLength(4);
    });

    it('should include escalation info when present', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const smsChannel = result.channels.find((c) => c.channel === 'sms');
      expect(smsChannel?.status).toBe(DeliveryStatus.ESCALATED);
      expect(smsChannel?.escalatedAt).toBeDefined();
      expect(smsChannel?.escalatedReason).toBe(
        'Delivery exhausted all retry attempts without acknowledgement',
      );
    });

    it('should throw NotFoundException when notification does not belong to user', async () => {
      mockNotificationRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.getDeliveryStatus('user-1', 'notif-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not expose secrets in error messages', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const allErrors = result.channels
        .map((c) => c.lastError)
        .filter((e) => e !== null);

      for (const error of allErrors) {
        expect(error).not.toMatch(/password|secret|api.?key|token|credential/i);
      }
    });
  });

  describe('getDeliveryStatusHistory', () => {
    it('should return paginated delivery status history', async () => {
      mockNotificationRepo.createQueryBuilder().getManyAndCount.mockResolvedValueOnce([
        [baseNotification],
        1,
      ]);
      mockDeliveryLogRepo.createQueryBuilder().getMany.mockResolvedValueOnce(
        makeLogs('notif-1'),
      );

      const result = await service.getDeliveryStatusHistory('user-1', 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should calculate correct pagination offset', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory('user-1', 3, 10);

      expect(mockQb.skip).toHaveBeenCalledWith(20); // (3-1) * 10
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });

    it('should filter by notification type when provided', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory(
        'user-1',
        1,
        20,
        NotificationTypeEnum.REWARD_ALERT,
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith('n.type = :notificationType', {
        notificationType: NotificationTypeEnum.REWARD_ALERT,
      });
    });

    it('should filter by delivery status when provided', async () => {
      const mockQb = mockDeliveryLogRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory('user-1', 1, 20, undefined, DeliveryStatus.FAILED);

      expect(mockQb.andWhere).toHaveBeenCalledWith('dl.status = :status', {
        status: DeliveryStatus.FAILED,
      });
    });

    it('should clamp limit to 100 to prevent abuse', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory('user-1', 1, 500);

      expect(mockQb.take).toHaveBeenCalledWith(100);
    });

    it('should default to page 1 and limit 20', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory('user-1');

      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(20);
    });

    it('should map delivery logs to status DTOs for each notification', async () => {
      const notif2 = { ...baseNotification, id: 'notif-2' };
      mockNotificationRepo.createQueryBuilder().getManyAndCount.mockResolvedValueOnce([
        [baseNotification, notif2],
        2,
      ]);
      mockDeliveryLogRepo.createQueryBuilder().getMany.mockResolvedValueOnce([
        ...makeLogs('notif-1'),
        ...makeLogs('notif-2'),
      ]);

      const result = await service.getDeliveryStatusHistory('user-1', 1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].notificationId).toBe('notif-1');
      expect(result.items[1].notificationId).toBe('notif-2');
    });

    it('should calculate totalPages correctly', async () => {
      mockNotificationRepo.createQueryBuilder().getManyAndCount.mockResolvedValueOnce([
        [baseNotification],
        150,
      ]);
      mockDeliveryLogRepo.createQueryBuilder().getMany.mockResolvedValueOnce(
        makeLogs('notif-1'),
      );

      const result = await service.getDeliveryStatusHistory('user-1', 1, 20);

      expect(result.totalPages).toBe(8); // ceil(150 / 20)
    });

    it('should handle empty history gracefully', async () => {
      mockNotificationRepo.createQueryBuilder().getManyAndCount.mockResolvedValueOnce([[], 0]);

      const result = await service.getDeliveryStatusHistory('user-1', 1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should support combined filtering — type AND status', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory(
        'user-1',
        1,
        20,
        NotificationTypeEnum.TASK_REMINDER,
        DeliveryStatus.FAILED,
      );

      expect(mockQb.andWhere).toHaveBeenCalledTimes(1);
      expect(mockQb.andWhere).toHaveBeenCalledWith('n.type = :notificationType', {
        notificationType: NotificationTypeEnum.TASK_REMINDER,
      });

      const deliveryQb = mockDeliveryLogRepo.createQueryBuilder();
      expect(deliveryQb.andWhere).toHaveBeenCalledWith('dl.status = :status', {
        status: DeliveryStatus.FAILED,
      });
    });

    it('should preserve retry history in each notification status', async () => {
      const result = await service.getDeliveryStatusHistory('user-1', 1, 20);

      const firstNotif = result.items[0];
      const emailChannel = firstNotif.channels.find((c) => c.channel === 'email');

      expect(emailChannel?.retryHistory).toHaveLength(2);
      expect(emailChannel?.retryHistory[0]).toEqual({
        attempt: 1,
        at: '2024-10-22T10:00:30Z',
        reason: 'NETWORK',
      });
    });
  });

  describe('delivery status edge cases', () => {
    it('should handle notification with no delivery logs', async () => {
      mockDeliveryLogRepo.find.mockResolvedValueOnce([]);

      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      // Should still return structure with all channels
      expect(result.channels.length).toBeGreaterThan(0);
      expect(result.channels.every((c) => c.retryHistory.length === 0)).toBe(true);
    });

    it('should handle null/undefined retry history gracefully', async () => {
      const logsWithNullHistory = makeLogs('notif-1', [
        { retryHistory: null as any },
      ]);
      mockDeliveryLogRepo.find.mockResolvedValueOnce(logsWithNullHistory);

      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const firstChannel = result.channels[0];
      expect(firstChannel.retryHistory).toEqual([]);
    });

    it('should expose attempt count for transparency', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const smsChannel = result.channels.find((c) => c.channel === 'sms');
      expect(smsChannel?.attempts).toBe(3); // max attempts reached
    });

    it('should preserve chronological order of retry history', async () => {
      const result = await service.getDeliveryStatus('user-1', 'notif-1');

      const emailChannel = result.channels.find((c) => c.channel === 'email');
      if (emailChannel?.retryHistory.length ?? 0 > 1) {
        const first = new Date(emailChannel!.retryHistory[0].at).getTime();
        const second = new Date(emailChannel!.retryHistory[1].at).getTime();
        expect(first).toBeLessThanOrEqual(second);
      }
    });
  });

  describe('authorization and ownership', () => {
    it('should only return delivery status for the requesting user', async () => {
      const wrongUserNotif = { ...baseNotification, userId: 'other-user' };
      mockNotificationRepo.findOne.mockResolvedValueOnce(wrongUserNotif);

      await expect(
        service.getDeliveryStatus('user-1', 'notif-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify userId in getDeliveryStatusHistory query', async () => {
      const mockQb = mockNotificationRepo.createQueryBuilder();

      await service.getDeliveryStatusHistory('user-1', 1, 20);

      expect(mockQb.where).toHaveBeenCalledWith('n.userId = :userId', {
        userId: 'user-1',
      });
    });
  });
});
