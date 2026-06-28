import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserActivity, ActivityType } from '../../../database/entities/user-activity.entity';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
  get(header: string): string | undefined;
  headers: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

interface ActivityMetadata {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  responseTime?: number;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  taskId?: string;
  [key: string]: any;
}

@Injectable()
export class ActivityTrackerService {
  constructor(
    @InjectRepository(UserActivity)
    private readonly activityRepository: Repository<UserActivity>,
  ) {}

  async trackLogin(
    userId: string,
    request?: AuthenticatedRequest,
    metadata?: ActivityMetadata,
  ): Promise<UserActivity> {
    return this.createActivity(userId, ActivityType.LOGIN, 'User logged in', {
      ...metadata,
      userAgent: request?.get('User-Agent'),
    }, request);
  }

  async trackLogout(
    userId: string,
    request?: AuthenticatedRequest,
    metadata?: ActivityMetadata,
  ): Promise<UserActivity> {
    return this.createActivity(userId, ActivityType.LOGOUT, 'User logged out', {
      ...metadata,
      userAgent: request?.get('User-Agent'),
    }, request);
  }

  async trackApiCall(
    userId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime?: number,
    request?: AuthenticatedRequest,
    metadata?: ActivityMetadata,
  ): Promise<UserActivity> {
    return this.createActivity(
      userId,
      ActivityType.API_CALL,
      `${method} ${endpoint} - ${statusCode}`,
      {
        endpoint,
        method,
        statusCode,
        responseTime,
        ...metadata,
      },
      request,
    );
  }

  async trackProfileUpdate(
    userId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>,
    request?: AuthenticatedRequest,
  ): Promise<UserActivity> {
    const changedFields = Object.keys(newValues).filter(
      key => oldValues[key] !== newValues[key],
    );

    return this.createActivity(
      userId,
      ActivityType.PROFILE_UPDATE,
      `Profile updated: ${changedFields.join(', ')}`,
      {
        oldValues,
        newValues,
        changedFields,
      },
      request,
    );
  }

  async trackTaskCreated(
    userId: string,
    taskId: string,
    taskTitle: string,
    request?: AuthenticatedRequest,
  ): Promise<UserActivity> {
    return this.createActivity(
      userId,
      ActivityType.TASK_CREATED,
      `Task created: ${taskTitle}`,
      {
        taskId,
        taskTitle,
      },
      request,
    );
  }

  async trackTaskCompleted(
    userId: string,
    taskId: string,
    taskTitle: string,
    request?: AuthenticatedRequest,
  ): Promise<UserActivity> {
    return this.createActivity(
      userId,
      ActivityType.TASK_COMPLETED,
      `Task completed: ${taskTitle}`,
      {
        taskId,
        taskTitle,
      },
      request,
    );
  }

  async trackAvatarUpdated(
    userId: string,
    avatarUrl: string,
    request?: AuthenticatedRequest,
  ): Promise<UserActivity> {
    return this.createActivity(
      userId,
      ActivityType.AVATAR_UPDATED,
      'Avatar updated',
      {
        avatarUrl,
      },
      request,
    );
  }

  async getUserActivities(
    userId: string,
    options: {
      activityType?: ActivityType;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{ activities: UserActivity[]; total: number }> {
    const queryBuilder = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.userId = :userId', { userId });

    if (options.activityType) {
      queryBuilder.andWhere('activity.activityType = :activityType', {
        activityType: options.activityType,
      });
    }

    if (options.startDate) {
      queryBuilder.andWhere('activity.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options.endDate) {
      queryBuilder.andWhere('activity.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('activity.createdAt', 'DESC')
      .skip(options.offset || 0)
      .take(options.limit || 50);

    const activities = await queryBuilder.getMany();

    return { activities, total };
  }

  async getActivityStats(userId: string): Promise<{
    totalActivities: number;
    activitiesByType: Record<ActivityType, number>;
    recentActivities: UserActivity[];
  }> {
    const totalActivities = await this.activityRepository.count({
      where: { userId },
    });

    const activitiesByTypeQuery = this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.activityType', 'activityType')
      .addSelect('COUNT(*)', 'count')
      .where('activity.userId = :userId', { userId })
      .groupBy('activity.activityType');

    const activitiesByTypeResult = await activitiesByTypeQuery.getRawMany();
    const activitiesByType = activitiesByTypeResult.reduce(
      (acc: Record<ActivityType, number>, item: any) => {
        if (item.activityType in ActivityType) {
          acc[item.activityType as ActivityType] = parseInt(item.count, 10);
        }
        return acc;
      },
      {} as Record<ActivityType, number>,
    );

    const recentActivities = await this.activityRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      totalActivities,
      activitiesByType,
      recentActivities,
    };
  }

  private async createActivity(
    userId: string,
    activityType: ActivityType,
    description: string,
    metadata: ActivityMetadata,
    request?: AuthenticatedRequest,
  ): Promise<UserActivity> {
    const activity = this.activityRepository.create({
      userId,
      activityType,
      description,
      metadata,
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.get('User-Agent'),
    });

    return this.activityRepository.save(activity);
  }

  private extractIpAddress(request?: AuthenticatedRequest): string | undefined {
    if (!request) return undefined;

    return (
      request.headers['x-forwarded-for']?.toString()?.split(',')[0] ||
      request.headers['x-real-ip']?.toString() ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress
    );
  }
}
