import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ActivityTrackerService } from './activity-tracker.service';
import { UserActivity, ActivityType } from '../../../database/entities/user-activity.entity';
import { Request } from 'express';

describe('ActivityTrackerService', () => {
  let service: ActivityTrackerService;
  let repository: jest.Mocked<Repository<UserActivity>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<UserActivity>>;

  const mockUserActivity: UserActivity = {
    id: 'activity-1',
    userId: 'user-1',
    activityType: ActivityType.LOGIN,
    description: 'User logged in',
    metadata: {},
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  } as any;

  const mockRequest = {
    get: jest.fn().mockReturnValue('Mozilla/5.0'),
    headers: {
      'x-forwarded-for': '10.0.0.1',
    },
    connection: { remoteAddress: '192.168.1.1' },
  } as unknown as Request;

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue([mockUserActivity]),
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { activityType: ActivityType.LOGIN, count: '5' },
        { activityType: ActivityType.API_CALL, count: '10' },
      ]),
    } as any;

    repository = {
      create: jest.fn().mockReturnValue(mockUserActivity),
      save: jest.fn().mockResolvedValue(mockUserActivity),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      find: jest.fn().mockResolvedValue([mockUserActivity]),
      count: jest.fn().mockResolvedValue(1),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityTrackerService,
        {
          provide: getRepositoryToken(UserActivity),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(ActivityTrackerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackLogin', () => {
    it('should create a login activity', async () => {
      const result = await service.trackLogin('user-1', mockRequest);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.LOGIN,
        description: 'User logged in',
        metadata: { userAgent: 'Mozilla/5.0' },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result.activityType).toBe(ActivityType.LOGIN);
    });

    it('should create login activity without request', async () => {
      const result = await service.trackLogin('user-1');

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.LOGIN,
        description: 'User logged in',
        metadata: {},
        ipAddress: undefined,
        userAgent: undefined,
      });
      expect(result.activityType).toBe(ActivityType.LOGIN);
    });
  });

  describe('trackLogout', () => {
    it('should create a logout activity', async () => {
      const result = await service.trackLogout('user-1', mockRequest);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.LOGOUT,
        description: 'User logged out',
        metadata: { userAgent: 'Mozilla/5.0' },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.activityType).toBe(ActivityType.LOGOUT);
    });
  });

  describe('trackApiCall', () => {
    it('should create an API call activity', async () => {
      const result = await service.trackApiCall(
        'user-1',
        '/api/tasks',
        'GET',
        200,
        150,
        mockRequest,
      );

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.API_CALL,
        description: 'GET /api/tasks - 200',
        metadata: {
          endpoint: '/api/tasks',
          method: 'GET',
          statusCode: 200,
          responseTime: 150,
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.activityType).toBe(ActivityType.API_CALL);
    });

    it('should create API call activity without response time', async () => {
      const result = await service.trackApiCall('user-1', '/api/tasks', 'POST', 201);

      expect(result.description).toBe('POST /api/tasks - 201');
    });
  });

  describe('trackProfileUpdate', () => {
    it('should create a profile update activity with changed fields', async () => {
      const oldValues = { name: 'John', email: 'john@example.com' };
      const newValues = { name: 'John', email: 'john.doe@example.com' };

      const result = await service.trackProfileUpdate(
        'user-1',
        oldValues,
        newValues,
        mockRequest,
      );

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.PROFILE_UPDATE,
        description: 'Profile updated: email',
        metadata: {
          oldValues,
          newValues,
          changedFields: ['email'],
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.activityType).toBe(ActivityType.PROFILE_UPDATE);
    });

    it('should handle multiple changed fields', async () => {
      const oldValues = { name: 'John', email: 'john@example.com', phone: '123' };
      const newValues = { name: 'Jane', email: 'jane@example.com', phone: '123' };

      const result = await service.trackProfileUpdate('user-1', oldValues, newValues);

      expect(result.description).toBe('Profile updated: name, email');
    });
  });

  describe('trackTaskCreated', () => {
    it('should create a task created activity', async () => {
      const result = await service.trackTaskCreated(
        'user-1',
        'task-1',
        'Morning Walk',
        mockRequest,
      );

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.TASK_CREATED,
        description: 'Task created: Morning Walk',
        metadata: {
          taskId: 'task-1',
          taskTitle: 'Morning Walk',
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.activityType).toBe(ActivityType.TASK_CREATED);
    });
  });

  describe('trackTaskCompleted', () => {
    it('should create a task completed activity', async () => {
      const result = await service.trackTaskCompleted(
        'user-1',
        'task-1',
        'Morning Walk',
        mockRequest,
      );

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.TASK_COMPLETED,
        description: 'Task completed: Morning Walk',
        metadata: {
          taskId: 'task-1',
          taskTitle: 'Morning Walk',
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.activityType).toBe(ActivityType.TASK_COMPLETED);
    });
  });

  describe('trackAvatarUpdated', () => {
    it('should create an avatar updated activity', async () => {
      const result = await service.trackAvatarUpdated(
        'user-1',
        'https://example.com/avatar.png',
        mockRequest,
      );

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        activityType: ActivityType.AVATAR_UPDATED,
        description: 'Avatar updated',
        metadata: {
          avatarUrl: 'https://example.com/avatar.png',
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
      expect(result.activityType).toBe(ActivityType.AVATAR_UPDATED);
    });
  });

  describe('getUserActivities', () => {
    it('should return activities without filters', async () => {
      const result = await service.getUserActivities('user-1');

      expect(queryBuilder.where).toHaveBeenCalledWith('activity.userId = :userId', {
        userId: 'user-1',
      });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('activity.createdAt', 'DESC');
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.take).toHaveBeenCalledWith(50);
      expect(result.activities).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by activity type', async () => {
      await service.getUserActivities('user-1', {
        activityType: ActivityType.LOGIN,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'activity.activityType = :activityType',
        { activityType: ActivityType.LOGIN },
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await service.getUserActivities('user-1', { startDate, endDate });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'activity.createdAt >= :startDate',
        { startDate },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'activity.createdAt <= :endDate',
        { endDate },
      );
    });

    it('should apply limit and offset', async () => {
      await service.getUserActivities('user-1', { limit: 10, offset: 20 });

      expect(queryBuilder.skip).toHaveBeenCalledWith(20);
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
    });
  });

  describe('getActivityStats', () => {
    it('should return activity statistics', async () => {
      const result = await service.getActivityStats('user-1');

      expect(repository.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(result.totalActivities).toBe(1);
      expect(result.activitiesByType).toEqual({
        [ActivityType.LOGIN]: 5,
        [ActivityType.API_CALL]: 10,
      });
      expect(result.recentActivities).toHaveLength(1);
    });
  });

  describe('extractIpAddress', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = {
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      } as unknown as Request;

      const result = (service as any).extractIpAddress(request);

      expect(result).toBe('10.0.0.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = {
        headers: { 'x-real-ip': '10.0.0.2' },
      } as unknown as Request;

      const result = (service as any).extractIpAddress(request);

      expect(result).toBe('10.0.0.2');
    });

    it('should extract IP from connection.remoteAddress', () => {
      const request = {
        headers: {},
        connection: { remoteAddress: '192.168.1.1' },
      } as unknown as Request;

      const result = (service as any).extractIpAddress(request);

      expect(result).toBe('192.168.1.1');
    });

    it('should extract IP from socket.remoteAddress', () => {
      const request = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const result = (service as any).extractIpAddress(request);

      expect(result).toBe('127.0.0.1');
    });

    it('should return undefined when no request provided', () => {
      const result = (service as any).extractIpAddress(undefined);

      expect(result).toBeUndefined();
    });
  });
});