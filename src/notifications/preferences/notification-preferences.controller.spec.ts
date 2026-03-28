import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let service: NotificationPreferencesService;

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

  const mockService = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  // Mock request with user
  const mockRequest = {
    user: {
      userId: 'user-123',
      email: 'test@example.com',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        { provide: NotificationPreferencesService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<NotificationPreferencesController>(NotificationPreferencesController);
    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================
  // GET PREFERENCES - AUTHENTICATION TESTS
  // ============================================

  describe('GET /users/me/notification-preferences', () => {
    it('should return preferences for authenticated user', async () => {
      mockService.getPreferences.mockResolvedValue(mockPreference);

      const result = await controller.getPreferences(mockRequest as any);

      expect(result).toEqual(mockPreference);
      expect(mockService.getPreferences).toHaveBeenCalledWith('user-123');
    });

    it('should extract userId from request.user', async () => {
      mockService.getPreferences.mockResolvedValue(mockPreference);

      await controller.getPreferences(mockRequest as any);

      expect(mockService.getPreferences).toHaveBeenCalledWith(
        expect.stringMatching('user-123'),
      );
    });
  });

  // ============================================
  // UPDATE PREFERENCES - PARTIAL UPDATE TESTS
  // ============================================

  describe('PATCH /users/me/notification-preferences', () => {
    it('should update only taskReminders (partial update) and persist', async () => {
      const updateDto: UpdatePreferencesDto = {
        taskReminders: false,
      };

      const updatedPreference = {
        ...mockPreference,
        taskReminders: false,
      };

      mockService.updatePreferences.mockResolvedValue(updatedPreference);

      const result = await controller.updatePreferences(
        mockRequest as any,
        updateDto,
      );

      expect(result.taskReminders).toBe(false);
      expect(result.rewardAlerts).toBe(true); // Unchanged
      expect(mockService.updatePreferences).toHaveBeenCalledWith(
        'user-123',
        updateDto,
      );
    });

    it('should update only rewardAlerts (partial update)', async () => {
      const updateDto: UpdatePreferencesDto = {
        rewardAlerts: false,
      };

      const updatedPreference = {
        ...mockPreference,
        rewardAlerts: false,
      };

      mockService.updatePreferences.mockResolvedValue(updatedPreference);

      const result = await controller.updatePreferences(
        mockRequest as any,
        updateDto,
      );

      expect(result.rewardAlerts).toBe(false);
      expect(result.taskReminders).toBe(true);
    });

    it('should handle empty update object (no changes)', async () => {
      const updateDto: UpdatePreferencesDto = {};

      mockService.updatePreferences.mockResolvedValue(mockPreference);

      const result = await controller.updatePreferences(
        mockRequest as any,
        updateDto,
      );

      expect(result).toEqual(mockPreference);
      expect(mockService.updatePreferences).toHaveBeenCalledWith(
        'user-123',
        updateDto,
      );
    });

    it('should handle multiple field updates at once', async () => {
      const updateDto: UpdatePreferencesDto = {
        taskReminders: false,
        streakAlerts: false,
        timezone: 'America/New_York',
      };

      const updatedPreference = {
        ...mockPreference,
        taskReminders: false,
        streakAlerts: false,
        timezone: 'America/New_York',
      };

      mockService.updatePreferences.mockResolvedValue(updatedPreference);

      const result = await controller.updatePreferences(
        mockRequest as any,
        updateDto,
      );

      expect(result.taskReminders).toBe(false);
      expect(result.streakAlerts).toBe(false);
      expect(result.timezone).toBe('America/New_York');
    });
  });

  // ============================================
  // UPDATE PREFERENCES - INVALID INPUT TESTS
  // ============================================

  describe('PATCH /users/me/notification-preferences - Validation', () => {
    it('should reject invalid timezone', async () => {
      const updateDto: UpdatePreferencesDto = {
        timezone: 'Invalid/Timezone',
      };

      mockService.updatePreferences.mockRejectedValue(
        new BadRequestException(
          "Invalid timezone 'Invalid/Timezone'. Please provide a valid IANA timezone.",
        ),
      );

      await expect(
        controller.updatePreferences(mockRequest as any, updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid quiet hours format', async () => {
      const updateDto: UpdatePreferencesDto = {
        quietHoursStart: '25:00', // Invalid hour
      };

      mockService.updatePreferences.mockRejectedValue(
        new BadRequestException(
          'quietHoursStart must be in HH:mm format (e.g., 22:00)',
        ),
      );

      await expect(
        controller.updatePreferences(mockRequest as any, updateDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // AUTHENTICATION TESTS
  // ============================================

  describe('Authentication', () => {
    it('should use userId from JWT token in request', async () => {
      mockService.getPreferences.mockResolvedValue(mockPreference);

      const customRequest = {
        user: {
          userId: 'different-user-id',
          email: 'another@example.com',
        },
      };

      await controller.getPreferences(customRequest as any);

      expect(mockService.getPreferences).toHaveBeenCalledWith(
        'different-user-id',
      );
    });

    it('should pass userId to updatePreferences from JWT', async () => {
      const updateDto: UpdatePreferencesDto = { taskReminders: false };
      mockService.updatePreferences.mockResolvedValue({
        ...mockPreference,
        taskReminders: false,
      });

      const customRequest = {
        user: {
          userId: 'admin-user-id',
        },
      };

      await controller.updatePreferences(customRequest as any, updateDto);

      expect(mockService.updatePreferences).toHaveBeenCalledWith(
        'admin-user-id',
        updateDto,
      );
    });
  });
});