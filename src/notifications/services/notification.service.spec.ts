import { NotificationService } from './notification.service';

describe('NotificationService - Deduplication', () => {
  let service: NotificationService;
  let mockPreferenceRepo: any;
  let mockNotificationRepo: any;
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

    mockCacheService = {
      setIfNotExists: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, def: any) => def),
    };

    service = new NotificationService(
      mockPreferenceRepo,
      mockNotificationRepo,
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
