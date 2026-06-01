import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { Notification } from '../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { PushNotificationService } from '../../shared/notifications/services/push-notification.service';
import { CacheService } from '../../shared/cache/cache.service';
import { ConfigService } from '@nestjs/config';

describe('NotificationService', () => {
  let service: NotificationService;
  let preferenceRepo: Repository<NotificationPreference>;
  let notificationRepo: Repository<Notification>;
  let userRepo: Repository<User>;
  let pushNotificationService: PushNotificationService;
  let cacheService: CacheService;

  const mockUser = {
    id: 'user-123',
    email: 'user@example.com',
    fcmToken: 'fcm-token-123',
  };

  const mockPreference = {
    userId: 'user-123',
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
  };

  beforeEach(async () => {
    const mockPreferenceRepo = {
      findOne: jest.fn().mockResolvedValue(mockPreference),
    };

    const mockNotificationRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((n) => Promise.resolve({ id: 'notif-123', ...n })),
    };

    const mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    const mockPushNotificationService = {
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };

    const mockCacheService = {
      setIfNotExists: jest.fn().mockResolvedValue(true),
    };

    const mockConfigService = {
      get: jest.fn((key: string, def: any) => def),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferenceRepo,
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: PushNotificationService,
          useValue: mockPushNotificationService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    preferenceRepo = module.get<Repository<NotificationPreference>>(getRepositoryToken(NotificationPreference));
    notificationRepo = module.get<Repository<Notification>>(getRepositoryToken(Notification));
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    pushNotificationService = module.get<PushNotificationService>(PushNotificationService);
    cacheService = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendPush', () => {
    it('should successfully send a push notification when preferences and token exist', async () => {
      const result = await service.sendPush('user-123', 'Test Title', 'Test Body');

      expect(result).toBe(true);
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'user-123' } });
      expect(pushNotificationService.sendPushNotification).toHaveBeenCalledWith(
        'fcm-token-123',
        'Test Title',
        'Test Body',
      );
      expect(notificationRepo.save).toHaveBeenCalled();
    });

    it('should not send push notification if push notifications are disabled in preferences', async () => {
      jest.spyOn(preferenceRepo, 'findOne').mockResolvedValue({
        ...mockPreference,
        pushNotifications: false,
      } as any);

      const result = await service.sendPush('user-123', 'Test Title', 'Test Body');

      expect(result).toBe(false);
      expect(pushNotificationService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should return false if user does not exist', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      const result = await service.sendPush('user-123', 'Test Title', 'Test Body');

      expect(result).toBe(false);
      expect(pushNotificationService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should return false if user does not have an FCM token', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue({
        ...mockUser,
        fcmToken: null,
      } as any);

      const result = await service.sendPush('user-123', 'Test Title', 'Test Body');

      expect(result).toBe(false);
      expect(pushNotificationService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('should return false if FCM push delivery fails but not break flow', async () => {
      jest.spyOn(pushNotificationService, 'sendPushNotification').mockResolvedValue(false);

      const result = await service.sendPush('user-123', 'Test Title', 'Test Body');

      expect(result).toBe(false);
      expect(notificationRepo.save).toHaveBeenCalled(); // notification history is still written
    });
  });
});

describe('NotificationService - Deduplication', () => {
  let service: NotificationService;
  let mockPreferenceRepo: any;
  let mockNotificationRepo: any;
  let mockUserRepo: any;
  let mockPushNotificationService: any;
  let mockCacheService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockPreferenceRepo = {
      findOne: jest.fn().mockResolvedValue({
        emailNotifications: true,
        smsNotifications: true,
        pushNotifications: true,
      }),
    };

    mockNotificationRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue({ fcmToken: 'token' }),
    };

    mockPushNotificationService = {
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };

    mockCacheService = {
      setIfNotExists: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, def: any) => def),
    };

    service = new NotificationService(
      mockPreferenceRepo,
      mockNotificationRepo,
      mockUserRepo,
      mockPushNotificationService,
      mockCacheService,
      mockConfigService,
    );
  });

  it('suppresses same notification type within cooldown', async () => {
    // First call allowed, second call suppressed
    mockCacheService.setIfNotExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const first = await service.sendEmail('user1', 'tmpl', {});
    const second = await service.sendEmail('user1', 'tmpl', {});

    expect(first).toBe(true);
    expect(second).toBe(false);

    expect(mockCacheService.setIfNotExists).toHaveBeenCalledTimes(2);
    expect(mockCacheService.setIfNotExists).toHaveBeenCalledWith(
      'notification:dedupe:user1:email',
      '1',
      expect.any(Number),
    );
  });

  it('allows different notification types independently', async () => {
    mockCacheService.setIfNotExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const email = await service.sendEmail('user2', 'tmpl', {});
    const sms = await service.sendSMS('user2', 'hello');

    expect(email).toBe(true);
    expect(sms).toBe(true);

    expect(mockCacheService.setIfNotExists).toHaveBeenCalledWith(
      'notification:dedupe:user2:email',
      '1',
      expect.any(Number),
    );

    expect(mockCacheService.setIfNotExists).toHaveBeenCalledWith(
      'notification:dedupe:user2:sms',
      '1',
      expect.any(Number),
    );
  });

  it('uses configured cooldown values', async () => {
    // Provide custom cooldowns via config
    mockConfigService.get = jest.fn((key: string, def: any) => {
      if (key === 'NOTIF_COOLDOWN_EMAIL') return 5;
      if (key === 'NOTIF_COOLDOWN_SMS') return 3;
      if (key === 'NOTIF_COOLDOWN_PUSH') return 2;
      return def;
    });

    // Recreate service to pick up new config
    service = new NotificationService(
      mockPreferenceRepo,
      mockNotificationRepo,
      mockUserRepo,
      mockPushNotificationService,
      mockCacheService,
      mockConfigService,
    );

    mockCacheService.setIfNotExists.mockResolvedValue(true);

    await service.sendEmail('user3', 'tmpl', {});
    await service.sendSMS('user3', 'hello');
    await service.sendPush('user3', 't', 'b');

    expect(mockCacheService.setIfNotExists).toHaveBeenCalledWith(
      'notification:dedupe:user3:email',
      '1',
      5,
    );

    expect(mockCacheService.setIfNotExists).toHaveBeenCalledWith(
      'notification:dedupe:user3:sms',
      '1',
      3,
    );

    expect(mockCacheService.setIfNotExists).toHaveBeenCalledWith(
      'notification:dedupe:user3:push',
      '1',
      2,
    );
  });
});
