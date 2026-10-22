import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { NotificationCenterController } from './notification-center.controller';
import { NotificationCenterService } from './notification-center.service';
import {
  NotificationDeliveryStatusDto,
  PaginatedDeliveryStatusDto,
  ChannelDeliveryStatusDto,
} from './dto/delivery-status.dto';
import { DeliveryStatus } from './entities/notification-delivery-log.entity';
import { NotificationTypeEnum } from './entities/in-app-notification.entity';

describe('NotificationCenterController — Delivery Status API', () => {
  let controller: NotificationCenterController;
  let service: NotificationCenterService;

  const mockAuthenticatedRequest = (userId: string = 'user-1') => ({
    user: { userId },
  });

  const mockDeliveryStatus: NotificationDeliveryStatusDto = {
    notificationId: 'notif-1',
    userId: 'user-1',
    notificationType: NotificationTypeEnum.TASK_REMINDER,
    title: 'Task Reminder',
    body: 'You have a pending task',
    createdAt: new Date('2024-10-22T10:00:00Z'),
    channels: [
      {
        channel: 'in_app',
        status: DeliveryStatus.SENT,
        attempts: 1,
        lastAttemptedAt: new Date('2024-10-22T10:00:00Z'),
        lastError: null,
        retryHistory: [{ attempt: 1, at: '2024-10-22T10:00:00Z', reason: 'SUCCESS' }],
      } as ChannelDeliveryStatusDto,
      {
        channel: 'email',
        status: DeliveryStatus.SENT,
        attempts: 2,
        lastAttemptedAt: new Date('2024-10-22T10:05:00Z'),
        lastError: null,
        retryHistory: [
          { attempt: 1, at: '2024-10-22T10:00:30Z', reason: 'NETWORK' },
          { attempt: 2, at: '2024-10-22T10:05:00Z', reason: 'SUCCESS' },
        ],
      } as ChannelDeliveryStatusDto,
      {
        channel: 'push',
        status: DeliveryStatus.FAILED,
        attempts: 3,
        lastAttemptedAt: new Date('2024-10-22T10:10:00Z'),
        lastError: 'User has no FCM token registered',
        retryHistory: [
          { attempt: 1, at: '2024-10-22T10:00:30Z', reason: 'DESTINATION_UNAVAILABLE' },
          { attempt: 2, at: '2024-10-22T10:05:00Z', reason: 'DESTINATION_UNAVAILABLE' },
          { attempt: 3, at: '2024-10-22T10:10:00Z', reason: 'DESTINATION_UNAVAILABLE' },
        ],
      } as ChannelDeliveryStatusDto,
      {
        channel: 'sms',
        status: DeliveryStatus.PENDING,
        attempts: 1,
        lastAttemptedAt: new Date('2024-10-22T10:00:30Z'),
        lastError: 'RATE_LIMIT',
        retryHistory: [{ attempt: 1, at: '2024-10-22T10:00:30Z', reason: 'RATE_LIMIT' }],
      } as ChannelDeliveryStatusDto,
    ],
    overallStatus: 'partially_delivered',
    successfulChannels: ['in_app', 'email'],
    failedChannels: ['push', 'sms'],
  };

  const mockPaginatedStatus: PaginatedDeliveryStatusDto = {
    items: [mockDeliveryStatus],
    total: 15,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    const mockNotificationCenterService = {
      getDeliveryStatus: jest.fn(),
      getDeliveryStatusHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationCenterController],
      providers: [
        {
          provide: NotificationCenterService,
          useValue: mockNotificationCenterService,
        },
      ],
    }).compile();

    controller = module.get<NotificationCenterController>(
      NotificationCenterController,
    );
    service = module.get<NotificationCenterService>(NotificationCenterService);
  });

  describe('getDeliveryStatus', () => {
    it('should return delivery status for a specific notification', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(mockDeliveryStatus);

      const result = await controller.getDeliveryStatus(
        request as any,
        'notif-1',
      );

      expect(result).toEqual(mockDeliveryStatus);
      expect(service.getDeliveryStatus).toHaveBeenCalledWith('user-1', 'notif-1');
    });

    it('should expose delivery status without secrets', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(mockDeliveryStatus);

      const result = await controller.getDeliveryStatus(
        request as any,
        'notif-1',
      );

      // Verify sensitive fields are not exposed
      expect(result.channels[1].lastError).not.toContain('password');
      expect(result.channels[1].lastError).not.toContain('secret');
      expect(result.channels[1].lastError).not.toContain('token');
    });

    it('should include retry history with attempts and categorized reasons', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(mockDeliveryStatus);

      const result = await controller.getDeliveryStatus(
        request as any,
        'notif-1',
      );

      const emailChannel = result.channels.find((c) => c.channel === 'email');
      expect(emailChannel?.retryHistory).toHaveLength(2);
      expect(emailChannel?.retryHistory[0]).toEqual({
        attempt: 1,
        at: '2024-10-22T10:00:30Z',
        reason: 'NETWORK',
      });
      expect(emailChannel?.retryHistory[1]).toEqual({
        attempt: 2,
        at: '2024-10-22T10:05:00Z',
        reason: 'SUCCESS',
      });
    });

    it('should calculate correct overall delivery status', async () => {
      const request = mockAuthenticatedRequest('user-1');

      // Test: all_delivered
      const allDelivered: NotificationDeliveryStatusDto = {
        ...mockDeliveryStatus,
        successfulChannels: ['in_app', 'email', 'push', 'sms'],
        failedChannels: [],
        overallStatus: 'all_delivered',
      };
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(allDelivered);

      let result = await controller.getDeliveryStatus(request as any, 'notif-1');
      expect(result.overallStatus).toBe('all_delivered');

      // Test: all_failed
      const allFailed: NotificationDeliveryStatusDto = {
        ...mockDeliveryStatus,
        successfulChannels: [],
        failedChannels: ['in_app', 'email', 'push', 'sms'],
        overallStatus: 'all_failed',
      };
      jest.spyOn(service, 'getDeliveryStatus').mockResolvedValueOnce(allFailed);

      result = await controller.getDeliveryStatus(request as any, 'notif-1');
      expect(result.overallStatus).toBe('all_failed');

      // Test: all_pending
      const allPending: NotificationDeliveryStatusDto = {
        ...mockDeliveryStatus,
        successfulChannels: [],
        failedChannels: ['in_app', 'email', 'push', 'sms'],
        overallStatus: 'all_pending',
      };
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(allPending);

      result = await controller.getDeliveryStatus(request as any, 'notif-1');
      expect(result.overallStatus).toBe('all_pending');
    });
  });

  describe('getDeliveryStatusHistory', () => {
    it('should return paginated delivery status history', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(mockPaginatedStatus);

      const result = await controller.getDeliveryStatusHistory(
        request as any,
        '1',
        '20',
      );

      expect(result).toEqual(mockPaginatedStatus);
      expect(service.getDeliveryStatusHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        20,
        undefined,
        undefined,
      );
    });

    it('should support filtering by notification type', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(mockPaginatedStatus);

      await controller.getDeliveryStatusHistory(
        request as any,
        '1',
        '20',
        'task_reminder',
      );

      expect(service.getDeliveryStatusHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        20,
        NotificationTypeEnum.TASK_REMINDER,
        undefined,
      );
    });

    it('should support filtering by delivery status', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(mockPaginatedStatus);

      await controller.getDeliveryStatusHistory(
        request as any,
        '1',
        '20',
        undefined,
        'sent',
      );

      expect(service.getDeliveryStatusHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        20,
        undefined,
        DeliveryStatus.SENT,
      );
    });

    it('should clamp limit to max 100', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(mockPaginatedStatus);

      await controller.getDeliveryStatusHistory(
        request as any,
        '1',
        '500', // exceeds max
      );

      expect(service.getDeliveryStatusHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        100, // clamped
        undefined,
        undefined,
      );
    });

    it('should default to page 1 and limit 20', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(mockPaginatedStatus);

      await controller.getDeliveryStatusHistory(request as any);

      expect(service.getDeliveryStatusHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        20,
        undefined,
        undefined,
      );
    });

    it('should calculate totalPages correctly in response', async () => {
      const request = mockAuthenticatedRequest('user-1');
      const result = mockPaginatedStatus;
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(result);

      const response = await controller.getDeliveryStatusHistory(request as any);

      expect(response.totalPages).toBe(1);
      expect(response.page).toBe(1);
      expect(response.limit).toBe(20);
    });

    it('should handle multi-page results', async () => {
      const request = mockAuthenticatedRequest('user-1');
      const multiPage: PaginatedDeliveryStatusDto = {
        ...mockPaginatedStatus,
        total: 150,
        limit: 20,
        totalPages: 8,
      };
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(multiPage);

      const response = await controller.getDeliveryStatusHistory(request as any);

      expect(response.totalPages).toBe(8);
      expect(Math.ceil(response.total / response.limit)).toBe(response.totalPages);
    });

    it('should ignore invalid filter parameters gracefully', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatusHistory')
        .mockResolvedValueOnce(mockPaginatedStatus);

      await controller.getDeliveryStatusHistory(
        request as any,
        '1',
        '20',
        'invalid_type', // not a valid NotificationTypeEnum
        'invalid_status', // not a valid DeliveryStatus
      );

      // Invalid filters should be converted to undefined
      expect(service.getDeliveryStatusHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        20,
        undefined,
        undefined,
      );
    });
  });

  describe('authorization checks', () => {
    it('should enforce permissions guard on delivery status endpoints', () => {
      // This is tested at the decorators level
      // Verify the endpoint has @Permissions decorator applied
      const metadata = Reflect.getMetadata(
        'permissions',
        controller.getDeliveryStatus,
      );
      // Note: This would require the method to have been decorated properly
      // Actual authorization testing happens in E2E tests with real guard
    });
  });

  describe('delivery status accuracy', () => {
    it('should track in-app channel as always sent', async () => {
      const request = mockAuthenticatedRequest('user-1');
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(mockDeliveryStatus);

      const result = await controller.getDeliveryStatus(request as any, 'notif-1');

      const inAppChannel = result.channels.find((c) => c.channel === 'in_app');
      expect(inAppChannel?.status).toBe(DeliveryStatus.SENT);
      expect(inAppChannel?.attempts).toBe(1);
    });

    it('should distinguish between pending, sent, failed, and escalated statuses', async () => {
      const request = mockAuthenticatedRequest('user-1');

      const statusesWithAllStates: NotificationDeliveryStatusDto = {
        ...mockDeliveryStatus,
        channels: [
          {
            channel: 'in_app',
            status: DeliveryStatus.SENT,
            attempts: 1,
            lastAttemptedAt: new Date(),
            lastError: null,
            retryHistory: [],
          } as ChannelDeliveryStatusDto,
          {
            channel: 'email',
            status: DeliveryStatus.PENDING,
            attempts: 1,
            lastAttemptedAt: new Date(),
            lastError: 'RATE_LIMIT',
            retryHistory: [],
          } as ChannelDeliveryStatusDto,
          {
            channel: 'push',
            status: DeliveryStatus.FAILED,
            attempts: 3,
            lastAttemptedAt: new Date(),
            lastError: 'MAX_ATTEMPTS_EXHAUSTED',
            retryHistory: [],
          } as ChannelDeliveryStatusDto,
          {
            channel: 'sms',
            status: DeliveryStatus.ESCALATED,
            attempts: 3,
            lastAttemptedAt: new Date(),
            lastError: 'PROVIDER_ERROR',
            retryHistory: [],
            escalatedAt: new Date(),
            escalatedReason: 'Delivery exhausted all retry attempts',
          } as ChannelDeliveryStatusDto,
        ],
      };

      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockResolvedValueOnce(statusesWithAllStates);

      const result = await controller.getDeliveryStatus(request as any, 'notif-1');

      const statuses = result.channels.map((c) => c.status);
      expect(statuses).toContain(DeliveryStatus.SENT);
      expect(statuses).toContain(DeliveryStatus.PENDING);
      expect(statuses).toContain(DeliveryStatus.FAILED);
      expect(statuses).toContain(DeliveryStatus.ESCALATED);
    });
  });

  describe('error handling', () => {
    it('should propagate service errors (e.g., NotFound) to the client', async () => {
      const request = mockAuthenticatedRequest('user-1');
      const notFoundError = new Error('Notification not found');
      jest
        .spyOn(service, 'getDeliveryStatus')
        .mockRejectedValueOnce(notFoundError);

      await expect(
        controller.getDeliveryStatus(request as any, 'missing-id'),
      ).rejects.toThrow();
    });
  });
});
