jest.mock('../../../tasks/entities/health-task.entity', () => ({
  HealthTask: class HealthTask {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskDetailService } from './task-detail.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

describe('TaskDetailService', () => {
  let service: TaskDetailService;

  const mockTaskRepo = {
    findOne: jest.fn(),
  };

  const taskId = 'task-1';
  const creatorId = 'creator-1';
  const otherUserId = 'user-2';

  const baseTask = {
    id: taskId,
    title: 'Daily walk',
    createdBy: creatorId,
    isActive: true,
  } as HealthTask;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskDetailService,
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockTaskRepo,
        },
      ],
    }).compile();

    service = module.get<TaskDetailService>(TaskDetailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDetail', () => {
    it('aggregates task, completion history, and reminders', async () => {
      mockTaskRepo.findOne.mockResolvedValue(baseTask);

      const completion = service.recordCompletion(taskId, creatorId, 'Done');
      const remindAt = new Date('2026-06-28T09:00:00.000Z');
      const reminder = service.addReminder(taskId, remindAt, 'Time to walk');

      const result = await service.getDetail(taskId, creatorId);

      expect(mockTaskRepo.findOne).toHaveBeenCalledWith({ where: { id: taskId } });
      expect(result.task).toEqual(baseTask);
      expect(result.completionHistory).toEqual([completion]);
      expect(result.reminders).toEqual([reminder]);
    });

    it('returns empty arrays when completion history and reminders are missing', async () => {
      mockTaskRepo.findOne.mockResolvedValue(baseTask);

      const result = await service.getDetail(taskId, creatorId);

      expect(result.task).toEqual(baseTask);
      expect(result.completionHistory).toEqual([]);
      expect(result.reminders).toEqual([]);
    });

    it('throws NotFoundException when task does not exist', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(service.getDetail('missing', creatorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getDetail('missing', creatorId)).rejects.toThrow(
        'Health task missing not found',
      );
    });

    it('denies access to inactive tasks for non-creator non-admin users', async () => {
      mockTaskRepo.findOne.mockResolvedValue({
        ...baseTask,
        isActive: false,
      });

      await expect(service.getDetail(taskId, otherUserId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.getDetail(taskId, otherUserId)).rejects.toThrow(
        'You do not have access to this task',
      );
    });

    it('allows creators to view inactive tasks', async () => {
      mockTaskRepo.findOne.mockResolvedValue({
        ...baseTask,
        isActive: false,
      });

      const result = await service.getDetail(taskId, creatorId);

      expect(result.task.isActive).toBe(false);
      expect(result.completionHistory).toEqual([]);
      expect(result.reminders).toEqual([]);
    });

    it('allows admins to view inactive tasks', async () => {
      mockTaskRepo.findOne.mockResolvedValue({
        ...baseTask,
        isActive: false,
      });

      const result = await service.getDetail(taskId, otherUserId, 'ADMIN');

      expect(result.task.isActive).toBe(false);
    });
  });

  describe('recordCompletion', () => {
    it('appends a completion record for the task', () => {
      const record = service.recordCompletion(taskId, creatorId, 'Finished');

      expect(record.completedBy).toBe(creatorId);
      expect(record.notes).toBe('Finished');
      expect(record.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('addReminder', () => {
    it('appends a reminder for the task', () => {
      const remindAt = new Date('2026-06-28T12:00:00.000Z');
      const reminder = service.addReminder(taskId, remindAt, 'Reminder');

      expect(reminder.remindAt).toBe(remindAt);
      expect(reminder.message).toBe('Reminder');
      expect(reminder.sent).toBe(false);
    });
  });
});
