import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { NotificationPreference } from '../entities/notification-preference.entity';

// Mock Redis
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  exists: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () => {
  return function () {
    return mockRedisClient;
  };
});

describe('NotificationService - Rate Limiting', () => {
  let service: NotificationService;
  let configService: ConfigService;

  const mockUserPreferences: NotificationPreference = {
    id: 'pref-1',
    userId: 'user-123',
    user: null as any,
    taskReminders: true,
    rewardAlerts: true,
    streakAlerts: true,
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: 'Africa/Lagos',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPreferenceRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset Redis mocks
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    mockRedisClient.incr.mockReset();
    mockRedisClient.expire.mockReset();
    mockRedisClient.exists.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferenceRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: any = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: '6379',
                REDIS_DB: '0',
                REDIS_TLS: 'false',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Email Rate Limiting (5 per hour per user)', () => {
    it('should allow sending email when under rate limit', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('3'); // 3 emails sent this hour
      mockRedisClient.incr.mockResolvedValue(4);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.sendEmail('user-123', 'welcome-template', {});

      expect(result).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining('notification:email:user-123'),
        3600, // 1 hour
      );
    });

    it('should block sending email when rate limit exceeded', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('5'); // Already at limit

      const result = await service.sendEmail('user-123', 'promo-template', {});

      expect(result).toBe(false);
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('should bypass rate limit for critical email notifications', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('5'); // At limit

      const result = await service.sendEmail(
        'user-123',
        'security-alert',
        {},
        true, // isCritical
      );

      expect(result).toBe(true);
      expect(mockRedisClient.get).not.toHaveBeenCalled(); // Doesn't check rate limit
    });

    it('should increment counter correctly for email rate limiting', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('2');
      mockRedisClient.incr.mockResolvedValue(3);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.sendEmail('user-123', 'template', {});

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'notification:email:user-123',
      );
      expect(mockRedisClient.incr).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'notification:email:user-123',
        3600,
      );
    });

    it('should handle zero email count (first email of the hour)', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue(null); // No key exists yet
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.sendEmail('user-123', 'template', {});

      expect(result).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalled();
    });
  });

  describe('SMS Rate Limiting (10 per day per user)', () => {
    it('should allow sending SMS when under rate limit', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('7'); // 7 SMS sent today
      mockRedisClient.incr.mockResolvedValue(8);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.sendSMS('user-123', 'Your verification code is 1234');

      expect(result).toBe(true);
      expect(mockRedisClient.incr).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining('notification:sms:user-123'),
        86400, // 24 hours
      );
    });

    it('should block sending SMS when rate limit exceeded', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('10'); // Already at daily limit

      const result = await service.sendSMS('user-123', 'Promo message');

      expect(result).toBe(false);
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('should bypass rate limit for critical SMS notifications', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('10'); // At limit

      const result = await service.sendSMS(
        'user-123',
        'Security alert: Suspicious login detected',
        true, // isCritical
      );

      expect(result).toBe(true);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should increment counter correctly for SMS rate limiting', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('5');
      mockRedisClient.incr.mockResolvedValue(6);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.sendSMS('user-123', 'Test message');

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'notification:sms:user-123',
      );
      expect(mockRedisClient.incr).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'notification:sms:user-123',
        86400,
      );
    });
  });

  describe('Push Notification Debouncing (5 minutes per type per user)', () => {
    it('should allow sending push notification when not debounced', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.exists.mockResolvedValue(0); // Key doesn't exist
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.sendPush(
        'user-123',
        'Task Reminder',
        'Time to complete your daily task!',
        false,
        'task-reminder',
      );

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'notification:push:user-123:task-reminder',
        '1',
        'EX',
        300, // 5 minutes
      );
    });

    it('should block sending push notification when debounced', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.exists.mockResolvedValue(1); // Key exists (recent notification)

      const result = await service.sendPush(
        'user-123',
        'Task Reminder',
        'Duplicate reminder',
        false,
        'task-reminder',
      );

      expect(result).toBe(false);
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should allow different notification types (separate debounce keys)', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      
      // First notification type is debounced
      mockRedisClient.exists.mockImplementation((key: string) => {
        if (key.includes('task-reminder')) return 1;
        if (key.includes('reward-alert')) return 0;
        return 0;
      });
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.sendPush(
        'user-123',
        'Reward Alert',
        'You earned a reward!',
        false,
        'reward-alert',
      );

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'notification:push:user-123:reward-alert',
        '1',
        'EX',
        300,
      );
    });

    it('should bypass debounce for critical push notifications', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.exists.mockResolvedValue(1); // Would normally be debounced

      const result = await service.sendPush(
        'user-123',
        'Security Alert',
        'Password changed successfully',
        true, // isCritical
        'security-alert',
      );

      expect(result).toBe(true);
      expect(mockRedisClient.exists).not.toHaveBeenCalled();
    });

    it('should use default type when notificationType not provided', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.exists.mockResolvedValue(0);
      mockRedisClient.set.mockResolvedValue('OK');

      await service.sendPush(
        'user-123',
        'General Notification',
        'Message',
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'notification:push:user-123:default',
        '1',
        'EX',
        300,
      );
    });
  });

  describe('sendMultiChannel with Rate Limiting', () => {
    it('should respect rate limits for all channels', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      
      // Email under limit
      mockRedisClient.get
        .mockResolvedValueOnce('2') // Email count
        .mockResolvedValueOnce('5'); // SMS count
      
      mockRedisClient.incr.mockResolvedValue(3);
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.exists.mockResolvedValue(0);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.sendMultiChannel('user-123', {
        email: { template: 'newsletter', data: {} },
        sms: { message: 'Update available' },
        push: { title: 'New Feature', body: 'Check it out!', type: 'feature' },
      });

      expect(result.email).toBe(true);
      expect(result.sms).toBe(true);
      expect(result.push).toBe(true);
    });

    it('should bypass all rate limits with isCritical flag', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      
      // All channels at/over limit
      mockRedisClient.get
        .mockResolvedValueOnce('5') // Email at limit
        .mockResolvedValueOnce('10'); // SMS at limit
      
      mockRedisClient.exists.mockResolvedValue(1); // Push debounced

      const result = await service.sendMultiChannel('user-123', {
        email: { template: 'security-alert', data: {} },
        sms: { message: 'Urgent security notice' },
        push: { title: 'Alert', body: 'Action required', type: 'security' },
        isCritical: true,
      });

      expect(result.email).toBe(true);
      expect(result.sms).toBe(true);
      expect(result.push).toBe(true);
      
      // Should not check rate limits for critical notifications
      expect(mockRedisClient.get).not.toHaveBeenCalled();
      expect(mockRedisClient.exists).not.toHaveBeenCalled();
    });

    it('should partially send when some channels are rate limited', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      
      // Email over limit, SMS under limit, push debounced
      mockRedisClient.get
        .mockResolvedValueOnce('5') // Email at limit
        .mockResolvedValueOnce('3'); // SMS under limit
      
      mockRedisClient.exists.mockResolvedValue(1); // Push debounced

      const result = await service.sendMultiChannel('user-123', {
        email: { template: 'promo', data: {} },
        sms: { message: 'Regular update' },
        push: { title: 'Update', body: 'Message', type: 'general' },
      });

      expect(result.email).toBe(false); // Rate limited
      expect(result.sms).toBe(true); // Allowed
      expect(result.push).toBe(false); // Debounced
    });
  });

  describe('Rate Limit Logging', () => {
    it('should log warning when email rate limit exceeded', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('5');

      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      await service.sendEmail('user-123', 'template', {});

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email rate limit exceeded'),
      );
    });

    it('should log warning when SMS rate limit exceeded', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('10');

      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      await service.sendSMS('user-123', 'message');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('SMS rate limit exceeded'),
      );
    });

    it('should log debug when push notification is debounced', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.exists.mockResolvedValue(1);

      const loggerSpy = jest.spyOn(service['logger'], 'debug');
      await service.sendPush('user-123', 'title', 'body', false, 'type');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Push notification skipped'),
      );
    });

    it('should log debug when critical notification bypasses rate limit', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('5'); // At limit

      const loggerSpy = jest.spyOn(service['logger'], 'debug');
      await service.sendEmail('user-123', 'critical-template', {}, true);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical email notification bypassing rate limit'),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle Redis connection failures gracefully', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.sendEmail('user-123', 'template', {}))
        .rejects.toThrow('Redis connection failed');
    });

    it('should handle invalid Redis responses', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('invalid-number');
      mockRedisClient.incr.mockResolvedValue(NaN);

      const result = await service.sendEmail('user-123', 'template', {});

      // Should handle NaN gracefully
      expect(typeof result).toBe('boolean');
    });

    it('should use correct Redis key prefixes for each channel', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(mockUserPreferences);
      mockRedisClient.get.mockResolvedValue('0');
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.exists.mockResolvedValue(0);
      mockRedisClient.set.mockResolvedValue('OK');

      await service.sendEmail('user-123', 'template', {});
      await service.sendSMS('user-123', 'message');
      await service.sendPush('user-123', 'title', 'body', false, 'type');

      expect(mockRedisClient.get).toHaveBeenCalledWith('notification:email:user-123');
      expect(mockRedisClient.get).toHaveBeenCalledWith('notification:sms:user-123');
      expect(mockRedisClient.exists).toHaveBeenCalledWith('notification:push:user-123:type');
    });
  });
});
