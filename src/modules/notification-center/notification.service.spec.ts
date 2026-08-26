import { NotificationService } from './notification.service';
import { NotificationCenterService } from './notification-center.service';
import { NotificationTypeEnum } from './entities/in-app-notification.entity';

describe('NotificationService compatibility API', () => {
  const center = {
    sendNotification: jest.fn(),
    getInbox: jest.fn(),
    getUnreadCount: jest.fn(),
    markAllRead: jest.fn(),
  } as unknown as jest.Mocked<NotificationCenterService>;

  const service = new NotificationService(center);

  beforeEach(() => jest.clearAllMocks());

  it('routes a real legacy push call through the canonical delivery pipeline', async () => {
    center.sendNotification.mockResolvedValue({ id: 'notification-1' } as any);

    await expect(service.sendPush('user-1', 'Task reminder', 'Time for your walk')).resolves.toBe(
      true
    );

    expect(center.sendNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      type: NotificationTypeEnum.SYSTEM,
      title: 'Task reminder',
      body: 'Time for your walk',
      data: { requestedChannel: 'push' },
    });
  });

  it('maps a legacy create call to a supported notification-center type', async () => {
    center.sendNotification.mockResolvedValue({ id: 'notification-2' } as any);

    await service.createNotification({
      userId: 'user-2',
      type: 'report_ready',
      title: 'Report ready',
      body: 'Download your report.',
    });

    expect(center.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationTypeEnum.REPORT_READY })
    );
  });
});
