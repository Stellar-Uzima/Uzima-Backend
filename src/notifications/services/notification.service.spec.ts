import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { Notification } from '../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { PushNotificationService } from '../../shared/notifications/services/push-notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let preferenceRepo: Repository<NotificationPreference>;
  let notificationRepo: Repository<Notification>;
  let userRepo: Repository<User>;
  let pushNotificationService: PushNotificationService;

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
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    preferenceRepo = module.get<Repository<NotificationPreference>>(getRepositoryToken(NotificationPreference));
    notificationRepo = module.get<Repository<Notification>>(getRepositoryToken(Notification));
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    pushNotificationService = module.get<PushNotificationService>(PushNotificationService);
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
