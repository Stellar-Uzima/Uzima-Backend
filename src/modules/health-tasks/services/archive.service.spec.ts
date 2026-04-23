import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

const mockRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
};

describe('ArchiveService', () => {
  let service: ArchiveService;

  beforeEach(() => {
    service = new ArchiveService(mockRepository as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('archives a completed task', async () => {
    const task = {
      id: 'task-1',
      status: 'completed',
      targetProfile: {},
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);
    mockRepository.save.mockImplementation(async (saved) => saved);

    const result = await service.archiveTask('task-1', 'admin');

    expect(result.targetProfile).toMatchObject({
      archive: {
        isArchived: true,
        archivedBy: 'admin',
      },
    });
  });

  it('rejects archive for non-completed task', async () => {
    const task = {
      id: 'task-2',
      status: 'pending',
      targetProfile: {},
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);

    await expect(service.archiveTask('task-2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns archived tasks separately', async () => {
    const archivedTask = {
      id: 'a',
      status: 'completed',
      targetProfile: { archive: { isArchived: true } },
    };
    const activeCompletedTask = {
      id: 'b',
      status: 'completed',
      targetProfile: { archive: { isArchived: false } },
    };
    mockRepository.find.mockResolvedValue([archivedTask, activeCompletedTask]);

    const result = await service.getArchivedTasks();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('restores an archived task', async () => {
    const task = {
      id: 'task-3',
      status: 'completed',
      targetProfile: { archive: { isArchived: true } },
    } as unknown as HealthTask;

    mockRepository.findOne.mockResolvedValue(task);
    mockRepository.save.mockImplementation(async (saved) => saved);

    const result = await service.restoreTask('task-3', 'admin');

    expect((result.targetProfile as any).archive.isArchived).toBe(false);
    expect((result.targetProfile as any).archive.restoredBy).toBe('admin');
  });

  it('updates auto-archive configuration', () => {
    const result = service.updateAutoArchiveConfig({
      enabled: false,
      olderThanDays: 60,
    });

    expect(result).toEqual({ enabled: false, olderThanDays: 60 });
  });

  it('auto-archives old completed tasks based on config', async () => {
    service.updateAutoArchiveConfig({ enabled: true, olderThanDays: 30 });

    const now = new Date('2026-04-23T00:00:00.000Z');
    const oldCompleted = {
      id: 'old',
      status: 'completed',
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
      targetProfile: {},
    } as unknown as HealthTask;
    const recentCompleted = {
      id: 'recent',
      status: 'completed',
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      targetProfile: {},
    } as unknown as HealthTask;

    mockRepository.find.mockResolvedValue([oldCompleted, recentCompleted]);
    mockRepository.save.mockImplementation(async (saved) => saved);

    const archivedCount = await service.autoArchiveOldCompletedTasks(now);

    expect(archivedCount).toBe(1);
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  it('throws not found when archiving unknown task', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    await expect(service.archiveTask('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
