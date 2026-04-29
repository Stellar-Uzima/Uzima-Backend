import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences, Theme, NotificationType } from '../../database/entities/user-preferences.entity';
import { User } from '../../database/entities/user.entity';

export interface UpdatePreferencesDto {
  theme?: Theme;
  language?: string;
  notifications?: Partial<UserPreferences['notifications']>;
  privacy?: Partial<UserPreferences['privacy']>;
  accessibility?: Partial<UserPreferences['accessibility']>;
  app?: Partial<UserPreferences['app']>;
}

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Get default preferences for new users
   */
  private getDefaultPreferences(): Partial<UserPreferences> {
    return {
      theme: Theme.SYSTEM,
      language: 'en',
      notifications: {
        [NotificationType.EMAIL]: {
          enabled: true,
          tasks: true,
          rewards: true,
          streaks: true,
          referrals: true,
          system: true,
        },
        [NotificationType.PUSH]: {
          enabled: true,
          tasks: true,
          rewards: true,
          streaks: true,
          referrals: false,
          system: true,
        },
        [NotificationType.SMS]: {
          enabled: false,
          tasks: false,
          rewards: false,
          streaks: false,
          referrals: false,
          system: false,
        },
      },
      privacy: {
        profileVisibility: 'private',
        showStats: false,
        showStreak: false,
        showRank: false,
      },
      accessibility: {
        fontSize: 'medium',
        highContrast: false,
        reducedMotion: false,
        screenReader: false,
      },
      app: {
        autoStartTasks: false,
        dailyReminderTime: '09:00',
        weeklyReportDay: 1, // Monday
        timezone: 'UTC',
      },
    };
  }

  /**
   * Get user preferences, creating defaults if they don't exist
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Verify user exists
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Create default preferences
      preferences = await this.createDefaultPreferences(userId);
      this.logger.log(`Created default preferences for user: ${userId}`);
    }

    return preferences;
  }

  /**
   * Create default preferences for a new user
   */
  async createDefaultPreferences(userId: string): Promise<UserPreferences> {
    const defaultPrefs = this.getDefaultPreferences();
    const preferences = this.preferencesRepository.create({
      userId,
      ...defaultPrefs,
    });

    return await this.preferencesRepository.save(preferences);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    updateData: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    const existingPreferences = await this.getPreferences(userId);

    // Merge updates with existing preferences
    const updatedPreferences = { ...existingPreferences };

    if (updateData.theme !== undefined) {
      updatedPreferences.theme = updateData.theme;
    }

    if (updateData.language !== undefined) {
      updatedPreferences.language = updateData.language;
    }

    if (updateData.notifications) {
      updatedPreferences.notifications = {
        ...updatedPreferences.notifications,
        ...updateData.notifications,
      };
    }

    if (updateData.privacy) {
      updatedPreferences.privacy = {
        ...updatedPreferences.privacy,
        ...updateData.privacy,
      };
    }

    if (updateData.accessibility) {
      updatedPreferences.accessibility = {
        ...updatedPreferences.accessibility,
        ...updateData.accessibility,
      };
    }

    if (updateData.app) {
      updatedPreferences.app = {
        ...updatedPreferences.app,
        ...updateData.app,
      };
    }

    const savedPreferences = await this.preferencesRepository.save(updatedPreferences);
    this.logger.log(`Updated preferences for user: ${userId}`);

    return savedPreferences;
  }

  /**
   * Reset user preferences to defaults
   */
  async resetPreferences(userId: string): Promise<UserPreferences> {
    const defaultPrefs = this.getDefaultPreferences();
    
    await this.preferencesRepository.update(userId, defaultPrefs);
    
    const preferences = await this.getPreferences(userId);
    this.logger.log(`Reset preferences to defaults for user: ${userId}`);

    return preferences;
  }

  /**
   * Delete user preferences (called when user is deleted)
   */
  async deletePreferences(userId: string): Promise<void> {
    const result = await this.preferencesRepository.delete(userId);
    
    if (result.affected === 0) {
      this.logger.warn(`No preferences found to delete for user: ${userId}`);
    } else {
      this.logger.log(`Deleted preferences for user: ${userId}`);
    }
  }

  /**
   * Get specific preference value
   */
  async getPreferenceValue<K extends keyof UserPreferences>(
    userId: string,
    key: K,
  ): Promise<UserPreferences[K]> {
    const preferences = await this.getPreferences(userId);
    return preferences[key];
  }

  /**
   * Check if user has enabled specific notification type
   */
  async isNotificationEnabled(
    userId: string,
    notificationType: NotificationType,
    category: keyof UserPreferences['notifications'][NotificationType],
  ): Promise<boolean> {
    const preferences = await this.getPreferences(userId);
    
    return preferences.notifications[notificationType]?.enabled && 
           preferences.notifications[notificationType]?.[category] || false;
  }

  /**
   * Get user's preferred language
   */
  async getUserLanguage(userId: string): Promise<string> {
    const preferences = await this.getPreferences(userId);
    return preferences.language;
  }

  /**
   * Get user's theme preference
   */
  async getUserTheme(userId: string): Promise<Theme> {
    const preferences = await this.getPreferences(userId);
    return preferences.theme;
  }

  /**
   * Get user's timezone
   */
  async getUserTimezone(userId: string): Promise<string> {
    const preferences = await this.getPreferences(userId);
    return preferences.app.timezone;
  }
}
