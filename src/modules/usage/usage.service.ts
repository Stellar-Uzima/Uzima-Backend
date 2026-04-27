import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Usage } from './entities/usage.entity';
import { NotificationsService } from '../../notifications/notifications.service'; // Assuming exists

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(Usage)
    private readonly usageRepository: Repository<Usage>,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
  ) {}

  async trackUsage(userId: number, event: string, amount: number = 1, metadata?: any): Promise<void> {
    const usage = this.usageRepository.create({
      userId,
      event,
      amount,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
    await this.usageRepository.save(usage);

    // Check limits and alert
    await this.checkLimits(userId, event);
  }

  async getUsage(userId: number, event?: string, startDate?: Date, endDate?: Date): Promise<Usage[]> {
    const where: any = { userId };
    if (event) where.event = event;
    if (startDate && endDate) where.createdAt = Between(startDate, endDate);

    return this.usageRepository.find({ where });
  }

  async aggregateUsage(userId: number, event: string, period: 'day' | 'month' | 'year' = 'month'): Promise<number> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const usages = await this.usageRepository.find({
      where: { userId, event, createdAt: Between(startDate, now) },
    });

    return usages.reduce((sum, u) => sum + (u.amount || 0), 0);
  }

  private async checkLimits(userId: number, event: string): Promise<void> {
    // Define limits - in real app, from config or DB
    const limits = {
      'api_call': { monthly: 1000, alertThreshold: 0.8 },
      'task_completion': { daily: 10, alertThreshold: 0.9 },
    };

    const limit = limits[event];
    if (!limit) return;

    const period = event === 'task_completion' ? 'day' : 'month';
    const currentUsage = await this.aggregateUsage(userId, event, period);
    const maxLimit = limit[period === 'day' ? 'daily' : 'monthly'];

    if (currentUsage >= maxLimit * limit.alertThreshold) {
      // Send alert
      await this.notificationsService.sendNotification(userId, {
        title: 'Usage Limit Approaching',
        message: `You have used ${currentUsage} of ${maxLimit} ${event}s this ${period}.`,
        type: 'warning',
      });
    }

    if (currentUsage >= maxLimit) {
      // Enforce limit - throw error or something
      throw new Error(`Usage limit exceeded for ${event}`);
    }
  }
}