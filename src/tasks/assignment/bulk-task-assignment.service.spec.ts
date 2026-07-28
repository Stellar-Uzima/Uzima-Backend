import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import {
  BulkTaskAssignmentService,
  MAX_BULK_ASSIGN_USERS,
} from './bulk-task-assignment.service';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { User } from '../../entities/user.entity';
import { TaskAssignmentService } from './task-assignment.service';

describe('BulkTaskAssignmentService', () => {
  let service: BulkTaskAssignmentService;

  const mockAssignmentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockTaskRepo = {
    find: jest.fn(),
  };
  const mockUserRepo = {
    find: jest.fn(),
  };
  const mockTaskAssignmentService = {
    invalidateCache: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkTaskAssignmentService,
        {
          provide: getRepositoryToken(DailyTaskAssignment),
          useValue: mockAssignmentRepo,
        },
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockTaskRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: TaskAssignmentService,
          useValue: mockTaskAssignmentService,
        },
      ],
    }).compile();

    service = module.get(BulkTaskAssignmentService);
  });

  it('rejects more than 1000 users', () => {
    const userIds = Array.from(
      { length: MAX_BULK_ASSIGN_USERS + 1 },
      (_, i) => `user-${i}`,
    );

    expect(() =>
      service.validateBulkAssignPayload(userIds, ['task-1']),
    ).toThrow(BadRequestException);
  });

  it('assigns tasks to active users', async () => {
    const user = { id: 'user-1', isActive: true } as User;
    const task = { id: 'task-1', isActive: true } as HealthTask;

    mockTaskRepo.find.mockResolvedValue([task]);
    mockUserRepo.find.mockResolvedValue([user]);
    mockAssignmentRepo.findOne.mockResolvedValue(null);
    mockAssignmentRepo.create.mockImplementation((data) => data);
    mockAssignmentRepo.save.mockImplementation((data) =>
      Promise.resolve({ ...data, id: 'assignment-1' }),
    );

    const result = await service.processBulkAssignment(
      ['user-1'],
      ['task-1'],
      '2026-06-01',
    );

    expect(result.processed).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockAssignmentRepo.save).toHaveBeenCalled();
    expect(mockTaskAssignmentService.invalidateCache).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
    );
  });
});
