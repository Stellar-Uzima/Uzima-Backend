import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SharingService } from './sharing.service';
import { SharePermission, TaskShare } from '../../../database/entities/task-share.entity';
import { HealthTask } from '../../../entities/health-task.entity';

const mockShareRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  create: jest.fn(),
};

const mockTaskRepository = {
  findOne: jest.fn(),
};

describe('SharingService', () => {
  let service: SharingService;

  beforeEach(() => {
    service = new SharingService(
      mockShareRepository as any,
      mockTaskRepository as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shareTask', () => {
    it('successfully shares a task with another user', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;
      const share = { taskId: 'task-1', sharedById: 'user-1', sharedWithId: 'user-2', permission: SharePermission.VIEW } as TaskShare;

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.findOne.mockResolvedValue(undefined);
      mockShareRepository.create.mockReturnValue(share);
      mockShareRepository.save.mockImplementation(async (s) => s);

      const result = await service.shareTask('task-1', 'user-1', 'user-2', SharePermission.VIEW);

      expect(mockTaskRepository.findOne).toHaveBeenCalledWith({ where: { id: 'task-1' } });
      expect(mockShareRepository.create).toHaveBeenCalledWith({
        taskId: 'task-1',
        sharedById: 'user-1',
        sharedWithId: 'user-2',
        permission: SharePermission.VIEW,
      });
      expect(mockShareRepository.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        taskId: 'task-1',
        sharedById: 'user-1',
        sharedWithId: 'user-2',
        permission: SharePermission.VIEW,
      });
    });

    it('updates permission when share already exists', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;
      const existingShare = { taskId: 'task-1', sharedWithId: 'user-2', sharedById: 'user-1', permission: SharePermission.VIEW } as TaskShare;
      const updatedShare = { ...existingShare, permission: SharePermission.EDIT } as TaskShare;

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.findOne.mockResolvedValue(existingShare);
      mockShareRepository.save.mockImplementation(async (s) => s);

      const result = await service.shareTask('task-1', 'user-1', 'user-2', SharePermission.EDIT);

      expect(mockShareRepository.save).toHaveBeenCalledWith(updatedShare);
      expect(result.permission).toBe(SharePermission.EDIT);
    });

    it('throws NotFoundException when task does not exist', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.shareTask('task-999', 'user-1', 'user-2')).rejects.toThrow(NotFoundException);
      await expect(service.shareTask('task-999', 'user-1', 'user-2')).rejects.toThrow('Task with ID task-999 not found');
    });

    it('throws ForbiddenException when user is not the task owner', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;

      mockTaskRepository.findOne.mockResolvedValue(task);

      await expect(service.shareTask('task-1', 'user-2', 'user-3')).rejects.toThrow(ForbiddenException);
      await expect(service.shareTask('task-1', 'user-2', 'user-3')).rejects.toThrow('You can only share your own tasks');
    });

    it('throws BadRequestException when sharing with yourself', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;

      mockTaskRepository.findOne.mockResolvedValue(task);

      await expect(service.shareTask('task-1', 'user-1', 'user-1')).rejects.toThrow(BadRequestException);
      await expect(service.shareTask('task-1', 'user-1', 'user-1')).rejects.toThrow('You cannot share a task with yourself');
    });
  });

  describe('revokeShare', () => {
    it('successfully revokes a share', async () => {
      const share = { taskId: 'task-1', sharedWithId: 'user-2', sharedById: 'user-1' } as TaskShare;

      mockShareRepository.findOne.mockResolvedValue(share);
      mockShareRepository.remove.mockResolvedValue(undefined);

      await service.revokeShare('task-1', 'user-1', 'user-2');

      expect(mockShareRepository.findOne).toHaveBeenCalledWith({ where: { taskId: 'task-1', sharedWithId: 'user-2' } });
      expect(mockShareRepository.remove).toHaveBeenCalledWith(share);
    });

    it('throws NotFoundException when share does not exist', async () => {
      mockShareRepository.findOne.mockResolvedValue(null);

      await expect(service.revokeShare('task-1', 'user-1', 'user-2')).rejects.toThrow(NotFoundException);
      await expect(service.revokeShare('task-1', 'user-1', 'user-2')).rejects.toThrow('Share not found');
    });

    it('throws ForbiddenException when user did not create the share', async () => {
      const share = { taskId: 'task-1', sharedWithId: 'user-2', sharedById: 'user-1' } as TaskShare;

      mockShareRepository.findOne.mockResolvedValue(share);

      await expect(service.revokeShare('task-1', 'user-3', 'user-2')).rejects.toThrow(ForbiddenException);
      await expect(service.revokeShare('task-1', 'user-3', 'user-2')).rejects.toThrow('You can only revoke shares you created');
    });
  });

  describe('getSharedTasksForUser', () => {
    it('returns tasks shared with user', async () => {
      const shares = [
        { task: { id: 'task-1', title: 'Task 1' } as HealthTask },
        { task: { id: 'task-2', title: 'Task 2' } as HealthTask },
      ] as TaskShare[];

      mockShareRepository.find.mockResolvedValue(shares);

      const result = await service.getSharedTasksForUser('user-2');

      expect(mockShareRepository.find).toHaveBeenCalledWith({
        where: { sharedWithId: 'user-2' },
        relations: ['task', 'sharedBy'],
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('task-1');
      expect(result[1].id).toBe('task-2');
    });

    it('returns empty array when no shares exist', async () => {
      mockShareRepository.find.mockResolvedValue([]);

      const result = await service.getSharedTasksForUser('user-2');

      expect(result).toEqual([]);
    });
  });

  describe('getTaskShares', () => {
    it('returns shares for a task owned by user', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;
      const shares = [
        { taskId: 'task-1', sharedWithId: 'user-2', sharedById: 'user-1', permission: SharePermission.VIEW } as TaskShare,
        { taskId: 'task-1', sharedWithId: 'user-3', sharedById: 'user-1', permission: SharePermission.EDIT } as TaskShare,
      ] as TaskShare[];

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.find.mockResolvedValue(shares);

      const result = await service.getTaskShares('task-1', 'user-1');

      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException when task does not exist', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.getTaskShares('task-999', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.getTaskShares('task-999', 'user-1')).rejects.toThrow('Task with ID task-999 not found');
    });

    it('throws ForbiddenException when user is not the task owner', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;

      mockTaskRepository.findOne.mockResolvedValue(task);

      await expect(service.getTaskShares('task-1', 'user-2')).rejects.toThrow(ForbiddenException);
      await expect(service.getTaskShares('task-1', 'user-2')).rejects.toThrow('You can only view shares for your own tasks');
    });
  });

  describe('hasPermission', () => {
    it('returns true when user is the task owner', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;

      mockTaskRepository.findOne.mockResolvedValue(task);

      const result = await service.hasPermission('task-1', 'user-1', SharePermission.VIEW);

      expect(result).toBe(true);
    });

    it('returns false when task does not exist', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      const result = await service.hasPermission('task-999', 'user-1', SharePermission.VIEW);

      expect(result).toBe(false);
    });

    it('returns true for VIEW permission when share exists', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;
      const share = { taskId: 'task-1', sharedWithId: 'user-2', permission: SharePermission.VIEW } as TaskShare;

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.findOne.mockResolvedValue(share);

      const result = await service.hasPermission('task-1', 'user-2', SharePermission.VIEW);

      expect(result).toBe(true);
    });

    it('returns false when no share exists for user', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.findOne.mockResolvedValue(null);

      const result = await service.hasPermission('task-1', 'user-2', SharePermission.VIEW);

      expect(result).toBe(false);
    });

    it('returns true for EDIT permission when share has EDIT', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;
      const share = { taskId: 'task-1', sharedWithId: 'user-2', permission: SharePermission.EDIT } as TaskShare;

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.findOne.mockResolvedValue(share);

      const result = await service.hasPermission('task-1', 'user-2', SharePermission.EDIT);

      expect(result).toBe(true);
    });

    it('returns false for EDIT permission when share has VIEW only', async () => {
      const task = { id: 'task-1', userId: 'user-1' } as HealthTask;
      const share = { taskId: 'task-1', sharedWithId: 'user-2', permission: SharePermission.VIEW } as TaskShare;

      mockTaskRepository.findOne.mockResolvedValue(task);
      mockShareRepository.findOne.mockResolvedValue(share);

      const result = await service.hasPermission('task-1', 'user-2', SharePermission.EDIT);

      expect(result).toBe(false);
    });
  });
});