import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { UpdatePreferencesDto, isValidTimezone } from './dto/update-preferences.dto';

@Injectable()
export class NotificationPreferencesService implements OnModuleInit {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferencesRepository: Repository<NotificationPreference>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    // Listen for user.registered event to create default preferences
    this.eventEmitter.on('user.registered', async (data: { userId: string }) => {
      try {
        await this.createDefaultsForNewUser(data.userId);
        this.logger.log(`Default notification preferences created for new user: ${data.userId}`);
      } catch (error) {
        this.logger.error(`Failed to create default preferences for user ${data.userId}:`, error.message);
      }
    });
  }

  /**
   * Get notification preferences for a user
   */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    const preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Return default preferences if not found
      return this.createDefaultPreferences(userId);
    }

    return preferences;
  }

  /**
   * Update notification preferences for a user
   */
  async updatePreferences(
    userId: string,
    updateDto: UpdatePreferencesDto,
  ): Promise<NotificationPreference> {
    // Validate timezone if provided
    if (updateDto.timezone && !isValidTimezone(updateDto.timezone)) {
      throw new BadRequestException(
        `Invalid timezone '${updateDto.timezone}'. Please provide a valid IANA timezone.`,
      );
    }

    // Validate quiet hours format if provided
    if (updateDto.quietHoursStart || updateDto.quietHoursEnd) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (updateDto.quietHoursStart && !timeRegex.test(updateDto.quietHoursStart)) {
        throw new BadRequestException(
          'quietHoursStart must be in HH:mm format (e.g., 22:00)',
        );
      }
      if (updateDto.quietHoursEnd && !timeRegex.test(updateDto.quietHoursEnd)) {
        throw new BadRequestException(
          'quietHoursEnd must be in HH:mm format (e.g., 07:00)',
        );
      }
    }

    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create new preferences with defaults
      preferences = await this.createDefaultPreferences(userId);
    }

    // Update only provided fields
    Object.assign(preferences, updateDto);
    const updated = await this.preferencesRepository.save(preferences);

    this.logger.log(`Notification preferences updated for user: ${userId}`);

    return updated;
  }

  /**
   * Create default notification preferences for a user
   */
  async createDefaultPreferences(userId: string): Promise<NotificationPreference> {
    const defaultPreferences = this.preferencesRepository.create({
      userId,
      taskReminders: true,
      rewardAlerts: true,
      streakAlerts: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: 'Africa/Lagos',
    });

    return this.preferencesRepository.save(defaultPreferences);
  }

  /**
   * Create default preferences (called from User entity @AfterInsert)
   */
  async createDefaultsForNewUser(userId: string): Promise<void> {
    await this.createDefaultPreferences(userId);
    this.logger.log(`Default notification preferences created for new user: ${userId}`);
  }
}
