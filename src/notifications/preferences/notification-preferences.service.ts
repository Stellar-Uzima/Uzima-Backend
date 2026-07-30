import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferencesRepository: Repository<NotificationPreference>,
  ) {}

  async getPreferences(userId: string): Promise<NotificationPreference | null> {
    return this.preferencesRepository.findOne({
      where: { userId },
    });
  }

  async createDefaultPreferences(userId: string): Promise<NotificationPreference> {
    const defaultPreferences = this.preferencesRepository.create({
      userId,
      taskReminders: true,
      rewardAlerts: true,
      streakAlerts: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: 'Africa/Lagos',
    } as any);

    return this.preferencesRepository.save(defaultPreferences);
  }
}
