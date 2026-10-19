import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { ChannelRouterService, RetryJobData } from './channel-router.service';
import { NotificationDeliveryLog, DeliveryStatus } from './entities/notification-delivery-log.entity';
import { InAppNotification, DeliveryChannel, NotificationTypeEnum } from './entities/in-app-notification.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../entities/user.entity';
import { SmsService } from '../../shared/sms/sms.service';
import { PushNotificationService } from '../../shared/notifications/services/push-notification.service';
import { EmailTemplateService } from '../../shared/notifications/services/email-template.service';
import { MetricsService } from '../../shared/metrics/metrics.service';
import { NOTIFICATION_CENTER_QUEUE } from './constants/notification-center.constants';

const makeNotification = (overrides: Partial<InAppNotification> = {}): InAppNotification =>
  ({
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationTypeEnum.SYSTEM,
    title: 'T',
    body: 'B',
    data: null,
    readAt: null,
    deliveredChannels: [DeliveryChannel.IN_APP],
    createdAt: new Date(),
    ...overrides,
  } as InAppNotification);

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'a@b.co',
    phone: '+2348000000000',
    fcmToken: 'tok',
    firstName: 'X',
    ...overrides,
  } as unknown as User);

describe('ChannelRouterService retry policy', () => {
  let service: ChannelRouterService;
  let deliveryLogRepo: any;
  let retryQueue: any;
  let smsService: any;
  let pushService: any;
  let emailTpl: any;
  let metrics: any;

  const config = {
    get: jest.fn((key: string, def?: any) => {
      const map: Record<string, any> = {
        NOTIFICATION_RETRY_MAX_ATTEMPTS: 3,
        NOTIFICATION_RETRY_BASE_DELAY_MS: 1000,
        NOTIFICATION_CIRCUIT_RESET_MS: 30000,
        NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD: 5,
        NOTIFICATION_RETRY_TERMINAL_FAILURE_STRATEGY: 'escalate',
      };
      return map[key] ?? def;
    }),
  };

  beforeEach(async () => {
    deliveryLogRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ ...v, id: 'log-1' })),
      update: jest.fn(async () => ({ affected: 1 })),
      manager: {
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        })),
      },
    };
    retryQueue = { add: jest.fn(async () => ({})) };
    smsService = { sendSms: jest.fn(async () => undefined) };
    pushService = { sendPushNotification: jest.fn(async () => true) };
    emailTpl = { render: jest.fn(async () => '<p>x</p>') };
    metrics = {
      recordNotificationDelivery: jest.fn(),
      incrementNotificationDeliveryRetries: jest.fn(),
      setNotificationCircuitOpen: jest.fn(),
      recordPermanentProviderFailure: jest.fn(),
      recordTerminalDeliveryFailure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelRouterService,
        { provide: getRepositoryToken(NotificationPreference), useValue: {} },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => makeUser()) } },
        { provide: getRepositoryToken(NotificationDeliveryLog), useValue: deliveryLogRepo },
        { provide: getQueueToken(NOTIFICATION_CENTER_QUEUE), useValue: retryQueue },
        { provide: SmsService, useValue: smsService },
        { provide: PushNotificationService, useValue: pushService },
        { provide: EmailTemplateService, useValue: emailTpl },
        { provide: ConfigService, useValue: config },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get(ChannelRouterService);
    jest.clearAllMocks();
  });

  it('marks delivery FAILED and does NOT retry on a permanent provider error', async () => {
    smsService.sendSms.mockRejectedValueOnce(
      Object.assign(new Error('Invalid phone number'), { statusCode: 400 }),
    );

    await service.route({
      notification: makeNotification(),
      user: makeUser({ email: null as any, fcmToken: null as any }),
      preferences: null,
    });

    expect(retryQueue.add).not.toHaveBeenCalled();
    expect(metrics.recordPermanentProviderFailure).toHaveBeenCalledWith(DeliveryChannel.SMS);
    expect(deliveryLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: DeliveryStatus.FAILED }),
    );
  });

  it('retries with exponential backoff on a transient error', async () => {
    smsService.sendSms.mockRejectedValueOnce(new Error('socket hang up'));

    await service.route({
      notification: makeNotification(),
      user: makeUser({ email: null as any, fcmToken: null as any }),
      preferences: null,
    });

    expect(retryQueue.add).toHaveBeenCalledTimes(1);
    const [jobName, payload, opts] = retryQueue.add.mock.calls[0];
    expect(jobName).toBe('retry-channel-delivery');
    expect((payload as RetryJobData).attempt).toBe(2);
    expect(opts.delay).toBe(1000 * Math.pow(2, 1));
    expect(metrics.incrementNotificationDeliveryRetries).toHaveBeenCalledWith(DeliveryChannel.SMS);
  });

  it('stops retrying once max attempts is reached', async () => {
    smsService.sendSms.mockRejectedValueOnce(new Error('socket hang up'));

    await service.retryDelivery({
      notificationId: 'notif-1',
      logId: 'log-1',
      channel: DeliveryChannel.SMS,
      userId: 'user-1',
      title: 'T',
      body: 'B',
      attempt: 3,
    });

    expect(retryQueue.add).not.toHaveBeenCalled();
    expect(metrics.recordTerminalDeliveryFailure).toHaveBeenCalledWith(DeliveryChannel.SMS);
    expect(deliveryLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: DeliveryStatus.FAILED, attempts: 3 }),
    );
  });

  it('re-queues after circuit-reset delay when the circuit is open', async () => {
    // Trip the circuit with 5 transient failures.
    smsService.sendSms.mockRejectedValue(new Error('socket hang up'));
    for (let i = 0; i < 5; i++) {
      await service.route({
        notification: makeNotification(),
        user: makeUser({ email: null as any, fcmToken: null as any }),
        preferences: null,
      });
    }
    expect(metrics.setNotificationCircuitOpen).toHaveBeenCalledWith(DeliveryChannel.SMS, true);

    retryQueue.add.mockClear();
    await service.route({
      notification: makeNotification(),
      user: makeUser({ email: null as any, fcmToken: null as any }),
      preferences: null,
    });

    const [, , opts] = retryQueue.add.mock.calls.at(-1)!;
    expect(opts.delay).toBe(30000);
  });

  it('does not retry when the user has no contact details for the channel', async () => {
    await service.route({
      notification: makeNotification(),
      user: makeUser({ email: null as any, fcmToken: null as any, phone: null as any }),
      preferences: {
        userId: 'user-1',
        emailNotifications: false,
        pushNotifications: false,
        smsNotifications: true,
      } as NotificationPreference,
    });

    // phone missing → permanent ('User has no phone number registered')
    expect(retryQueue.add).not.toHaveBeenCalled();
  });
});
