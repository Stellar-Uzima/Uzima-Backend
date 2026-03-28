import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { UpdatePreferencesDto, isValidTimezone } from './dto/update-preferences.dto';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repository: Repository<NotificationPreference>;

  // Mock data
  const mockPreference: NotificationPreference = {
    id: 'pref-1',
    userId: 'user-123',
    user: null as any,
    taskReminders: true,
    rewardAlerts: true,
    streakAlerts: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: 'Africa/Lagos',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockEventEmitter = {
    on: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: getRepositoryToken(NotificationPreference), useValue: mockRepository },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
    repository = module.get<Repository<NotificationPreference>>(getRepositoryToken(NotificationPreference));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // GET PREFERENCES TESTS
  // ============================================

  describe('getPreferences', () => {
    it('should return existing preferences for user', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreference);

      const result = await service.getPreferences('user-123');

      expect(result).toEqual(mockPreference);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
    });

    it('should create default preferences when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...mockPreference,
        taskReminders: true,
        rewardAlerts: true,
        streakAlerts: true,
      });
      mockRepository.save.mockResolvedValue(mockPreference);

      const result = await service.getPreferences('new-user');

      expect(result).toEqual(mockPreference);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  // ============================================
  // UPDATE PREFERENCES TESTS - PARTIAL UPDATES
  // ============================================

  describe('updatePreferences - Partial Updates', () => {
    it('should update only email notification (taskReminders) and persist', async () => {
      const updateDto: UpdatePreferencesDto = {
        taskReminders: false,
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        taskReminders: false,
        rewardAlerts: true,
        streakAlerts: true,
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.taskReminders).toBe(false);
      expect(result.rewardAlerts).toBe(true); // Unchanged
      expect(result.streakAlerts).toBe(true); // Unchanged
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should update only rewardAlerts and persist', async () => {
      const updateDto: UpdatePreferencesDto = {
        rewardAlerts: false,
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        taskReminders: true,
        rewardAlerts: false,
        streakAlerts: true,
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.taskReminders).toBe(true); // Unchanged
      expect(result.rewardAlerts).toBe(false);
      expect(result.streakAlerts).toBe(true); // Unchanged
    });

    it('should update multiple fields at once (partial update)', async () => {
      const updateDto: UpdatePreferencesDto = {
        taskReminders: false,
        streakAlerts: false,
        timezone: 'America/New_York',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        taskReminders: false,
        rewardAlerts: true,
        streakAlerts: false,
        timezone: 'America/New_York',
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.taskReminders).toBe(false);
      expect(result.rewardAlerts).toBe(true);
      expect(result.streakAlerts).toBe(false);
      expect(result.timezone).toBe('America/New_York');
    });

    it('should update quiet hours and persist', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.quietHoursStart).toBe('22:00');
      expect(result.quietHoursEnd).toBe('07:00');
    });

    it('should create new preferences if user has none', async () => {
      const updateDto: UpdatePreferencesDto = {
        taskReminders: false,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...mockPreference,
        taskReminders: true,
      });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        taskReminders: false,
      });

      const result = await service.updatePreferences('new-user', updateDto);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.taskReminders).toBe(false);
    });
  });

  // ============================================
  // UPDATE PREFERENCES TESTS - VALIDATION
  // ============================================

  describe('updatePreferences - Validation', () => {
    it('should reject invalid timezone', async () => {
      const updateDto: UpdatePreferencesDto = {
        timezone: 'Invalid/Timezone',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });

      await expect(
        service.updatePreferences('user-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid timezone from the list', async () => {
      const updateDto: UpdatePreferencesDto = {
        timezone: 'Europe/London',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        timezone: 'Europe/London',
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.timezone).toBe('Europe/London');
    });

    it('should reject invalid quietHoursStart format', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursStart: '25:00', // Invalid hour
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });

      await expect(
        service.updatePreferences('user-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid quietHoursEnd format', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursEnd: 'abc', // Invalid format
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });

      await expect(
        service.updatePreferences('user-123', updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid quiet hours time format', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursStart: '23:59',
        quietHoursEnd: '00:00',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        quietHoursStart: '23:59',
        quietHoursEnd: '00:00',
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.quietHoursStart).toBe('23:59');
      expect(result.quietHoursEnd).toBe('00:00');
    });

    it('should accept edge case time 00:00', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursStart: '00:00',
        quietHoursEnd: '06:00',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        quietHoursStart: '00:00',
        quietHoursEnd: '06:00',
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.quietHoursStart).toBe('00:00');
    });

    it('should accept edge case time 23:00', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockPreference });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
      });

      const result = await service.updatePreferences('user-123', updateDto);

      expect(result.quietHoursStart).toBe('23:00');
    });
  });

  // ============================================
  // CREATE DEFAULT PREFERENCES TESTS
  // ============================================

  describe('createDefaultPreferences', () => {
    it('should create preferences with all defaults', async () => {
      mockRepository.create.mockReturnValue({
        userId: 'new-user',
        taskReminders: true,
        rewardAlerts: true,
        streakAlerts: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: 'Africa/Lagos',
      });
      mockRepository.save.mockResolvedValue({
        ...mockPreference,
        userId: 'new-user',
      });

      const result = await service.createDefaultPreferences('new-user');

      expect(result.userId).toBe('new-user');
      expect(result.taskReminders).toBe(true);
      expect(result.rewardAlerts).toBe(true);
      expect(result.streakAlerts).toBe(true);
      expect(result.timezone).toBe('Africa/Lagos');
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId: 'new-user',
        taskReminders: true,
        rewardAlerts: true,
        streakAlerts: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: 'Africa/Lagos',
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  // ============================================
  // TIMEZONE VALIDATOR TESTS
  // ============================================

  describe('isValidTimezone', () => {
    it('should return true for valid timezones', () => {
      expect(isValidTimezone('Africa/Lagos')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    });

    it('should return false for invalid timezones', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('GMT')).toBe(false);
      expect(isValidTimezone('EST')).toBe(false);
    });
  });
});