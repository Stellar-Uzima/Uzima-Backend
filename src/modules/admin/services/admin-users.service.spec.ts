import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { User } from '@/entities/user.entity';
import { AuditService } from '@/audit/audit.service';
import { StreaksService } from '@/streaks/streaks.service';
import { TaskAssignmentService } from '@/tasks/assignment/task-assignment.service';
import { Role } from '@modules/auth/enums/role.enum';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let usersRepository: jest.Mocked<Repository<User>>;
  let taskAssignmentService: jest.Mocked<TaskAssignmentService>;
  let auditService: jest.Mocked<AuditService>;

  const mockUser = {
    id: 'user-1',
    email: 'user1@example.com',
    phoneNumber: '+254700000000',
    firstName: 'Jane',
    lastName: 'Doe',
    role: Role.USER,
    status: 'SUSPENDED',
    isVerified: true,
    isActive: false,
    deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    walletBalance: '12.5000000',
  } as any;

  beforeEach(async () => {
    const mockUsersRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockAuditService = {
      logAction: jest.fn(),
      logEvent: jest.fn(),
    };

    const mockStreaksService = {
      getStreakHistory: jest.fn(),
    };

    const mockTaskAssignmentService = {
      getAssignmentHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: StreaksService,
          useValue: mockStreaksService,
        },
        {
          provide: TaskAssignmentService,
          useValue: mockTaskAssignmentService,
        },
      ],
    }).compile();

    service = module.get(AdminUsersService);
    usersRepository = module.get(getRepositoryToken(User));
    taskAssignmentService = module.get(TaskAssignmentService);
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserTasks (#1015)', () => {
    it('returns the user summary along with their full assignment/task history', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      taskAssignmentService.getAssignmentHistory.mockResolvedValue([
        {
          id: 'assignment-2',
          assignedDate: '2026-08-20',
          tasks: [{ id: 'task-3', title: 'Drink water' }],
        },
        {
          id: 'assignment-1',
          assignedDate: '2026-08-19',
          tasks: [
            { id: 'task-1', title: 'Walk 5000 steps' },
            { id: 'task-2', title: 'Sleep 8 hours' },
          ],
        },
      ] as any);

      const result = await service.getUserTasks('user-1');

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'user1@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: Role.USER,
      });

      // This is the actual gap #1015 closes: previously this was always a
      // hardcoded empty array regardless of what the user was assigned.
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toEqual({
        assignmentId: 'assignment-2',
        assignedDate: '2026-08-20',
        tasks: [{ id: 'task-3', title: 'Drink water' }],
      });
      expect(result.tasks[1].tasks).toHaveLength(2);

      expect(taskAssignmentService.getAssignmentHistory).toHaveBeenCalledWith('user-1');
    });

    it('returns an empty task list for a user with no assignments, without erroring', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      taskAssignmentService.getAssignmentHistory.mockResolvedValue([]);

      const result = await service.getUserTasks('user-1');

      expect(result.tasks).toEqual([]);
    });

    it('throws NotFoundException (404) for an unknown user id', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserTasks('missing-user')).rejects.toThrow(NotFoundException);

      // Must not query assignment history for a user that doesn't exist.
      expect(taskAssignmentService.getAssignmentHistory).not.toHaveBeenCalled();
    });
  });

  describe('recoverUser (#1384)', () => {
    it('validates the existing identity, reactivates the same account, preserves balance, and audits the admin reason', async () => {
      const recoverableUser = { ...mockUser };
      usersRepository.findOne.mockResolvedValueOnce(recoverableUser).mockResolvedValueOnce(null);
      usersRepository.save.mockImplementation(async (user) => user as User);
      const dto = {
        identityEmail: 'USER1@example.com',
        email: 'jane.corrected@example.com',
        reason: 'User confirmed ownership with identity documents',
      };

      const result = await service.recoverUser('admin-1', 'user-1', dto);

      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          email: 'jane.corrected@example.com',
          walletBalance: '12.5000000',
          isActive: true,
          status: 'active',
          isVerified: false,
          deletedAt: null,
        })
      );
      expect(result).toMatchObject({
        id: 'user-1',
        email: 'jane.corrected@example.com',
        status: 'active',
        isVerified: false,
      });
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          resourceId: 'user-1',
          description: expect.stringContaining(dto.reason),
          oldValues: expect.objectContaining({ email: 'user1@example.com' }),
          newValues: expect.objectContaining({ email: 'jane.corrected@example.com' }),
          isSensitive: true,
          isComplianceEvent: true,
        })
      );
    });

    it('rejects identity that does not match the verified account', async () => {
      usersRepository.findOne.mockResolvedValue({ ...mockUser });

      await expect(
        service.recoverUser('admin-1', 'user-1', {
          identityEmail: 'someone-else@example.com',
          reason: 'User reported being locked out of account',
        })
      ).rejects.toThrow(ForbiddenException);

      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a replacement identity already used by another account', async () => {
      usersRepository.findOne
        .mockResolvedValueOnce({ ...mockUser })
        .mockResolvedValueOnce({ id: 'other-user' });

      await expect(
        service.recoverUser('admin-1', 'user-1', {
          identityEmail: 'user1@example.com',
          email: 'taken@example.com',
          reason: 'User reported being locked out of account',
        })
      ).rejects.toThrow(ConflictException);

      expect(usersRepository.save).not.toHaveBeenCalled();
    });
  });
});
