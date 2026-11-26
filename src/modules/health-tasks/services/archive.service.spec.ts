import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

const mockQueryBuilder: any = {};

const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
};

const mockActivityLogService = {
  logTaskChange: jest.fn(),
};

describe('ArchiveService', () => {
  let service: ArchiveService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockQueryBuilder, {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    });
    mockRepository.save.mockImplementation(async (saved) => saved);

    service = new ArchiveService(mockRepository as any, mockActivityLogService as any);
  });

  it('archives a completed task', async () => {
    const task = {
      id: 'task-1',
      status: 'completed',
      targetProfile: {},
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);

    const result = await service.archiveTask('task-1', 'admin');

    expect(result.targetProfile).toMatchObject({
      archive: {
        isArchived: true,
        archivedBy: 'admin',
      },
    });
    expect(mockRepository.save).toHaveBeenCalledWith(task);
    expect(mockActivityLogService.logTaskChange).toHaveBeenCalledWith(
      'task-1',
      'admin',
      'task.archived',
      expect.objectContaining({ archivedBy: 'admin' })
    );
  });

  it('rejects archive for non-completed task', async () => {
    const task = {
      id: 'task-2',
      status: 'pending',
      targetProfile: {},
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);

    await expect(service.archiveTask('task-2')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('returns archived tasks separately', async () => {
    const archivedTask = { id: 'a' };
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[archivedTask], 1]);

    const result = await service.getArchivedTasks(1, 10);

    expect(result).toEqual({ data: [archivedTask], total: 1 });
    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('restores an archived task', async () => {
    const task = {
      id: 'task-3',
      status: 'completed',
      targetProfile: { archive: { isArchived: true } },
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);

    const result = await service.restoreTask('task-3', 'admin');

    expect((result.targetProfile as any).archive.isArchived).toBe(false);
    expect((result.targetProfile as any).archive.restoredBy).toBe('admin');
  });

  it('rejects restoring a task that is not archived', async () => {
    const task = {
      id: 'task-4',
      status: 'completed',
      targetProfile: {},
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);

    await expect(service.restoreTask('task-4')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates auto-archive configuration', () => {
    const result = service.updateAutoArchiveConfig({
      enabled: false,
      olderThanDays: 60,
    });

    expect(result).toEqual({ enabled: false, olderThanDays: 60 });
  });

  it('rejects a negative auto-archive threshold', () => {
    expect(() => service.updateAutoArchiveConfig({ olderThanDays: -1 })).toThrow(
      BadRequestException
    );
  });

  it('auto-archives old completed tasks based on config', async () => {
    service.updateAutoArchiveConfig({ enabled: true, olderThanDays: 30 });

    const oldCompleted = {
      id: 'old',
      status: 'completed',
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
      targetProfile: {},
    } as unknown as HealthTask;

    mockQueryBuilder.getMany.mockResolvedValue([oldCompleted]);

    const archivedCount = await service.autoArchiveOldCompletedTasks(
      new Date('2026-04-23T00:00:00.000Z')
    );

    expect(archivedCount).toBe(1);
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does nothing when auto-archive is disabled', async () => {
    service.updateAutoArchiveConfig({ enabled: false });

    const archivedCount = await service.autoArchiveOldCompletedTasks();

    expect(archivedCount).toBe(0);
    expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('throws not found when archiving unknown task', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await expect(service.archiveTask('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
