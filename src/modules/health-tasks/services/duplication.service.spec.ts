import { NotFoundException } from '@nestjs/common';
import { DuplicationService } from './duplication.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

const mockRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('DuplicationService', () => {
  let service: DuplicationService;

  beforeEach(() => {
    service = new DuplicationService(mockRepository as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('duplicateTask', () => {
    it('duplicates a task and appends (Copy) to title', async () => {
      const task = {
        id: 'task-1',
        title: 'Morning Run',
        description: 'Run 5km',
        status: 'completed',
        xlmReward: 10,
        targetProfile: { dueDate: '2026-07-01', settings: { reminder: true } },
        category: 'fitness',
        isActive: true,
        createdAt: new Date('2026-01-01'),
        deletedAt: null,
        reminderTime: null,
      } as unknown as HealthTask;

      const created = { ...task, id: 'new-id', status: 'draft', title: 'Morning Run (Copy)' };
      delete created.createdAt;
      delete created.deletedAt;

      mockRepository.findOne.mockResolvedValue(task);
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.duplicateTask('task-1');

      expect(result.title).toBe('Morning Run (Copy)');
      expect(result.status).toBe('draft');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Morning Run (Copy)',
          status: 'draft',
          targetProfile: { dueDate: '2026-07-01', settings: { reminder: true } },
        }),
      );
    });

    it('uses custom title override', async () => {
      const task = {
        id: 'task-1',
        title: 'Morning Run',
        status: 'completed',
        xlmReward: 10,
        targetProfile: {},
        category: 'fitness',
        isActive: true,
        createdAt: new Date(),
        deletedAt: null,
        reminderTime: null,
      } as unknown as HealthTask;

      const created = {
        ...task,
        id: 'new-id',
        status: 'draft',
        title: 'Evening Run',
      };
      delete created.createdAt;
      delete created.deletedAt;

      mockRepository.findOne.mockResolvedValue(task);
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.duplicateTask('task-1', { title: 'Evening Run' });

      expect(result.title).toBe('Evening Run');
    });

    it('throws NotFoundException when task does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.duplicateTask('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resets completion-related fields on duplicated task', async () => {
      const task = {
        id: 'task-1',
        title: 'Drink Water',
        status: 'completed',
        xlmReward: 10,
        targetProfile: { progress: 100, completionDate: '2026-06-01' },
        category: 'nutrition',
        isActive: true,
        createdAt: new Date(),
        deletedAt: null,
        reminderTime: null,
      } as unknown as HealthTask;

      const created = {
        ...task,
        id: 'new-id',
        status: 'draft',
        title: 'Drink Water (Copy)',
      };
      delete created.createdAt;
      delete created.deletedAt;

      mockRepository.findOne.mockResolvedValue(task);
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.duplicateTask('task-1');

      expect(result.status).toBe('draft');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft' }),
      );
    });

    it('overrides dueDate in targetProfile when provided', async () => {
      const task = {
        id: 'task-1',
        title: 'Yoga',
        status: 'completed',
        xlmReward: 5,
        targetProfile: { dueDate: '2026-07-01' },
        category: 'mental',
        isActive: true,
        createdAt: new Date(),
        deletedAt: null,
        reminderTime: null,
      } as unknown as HealthTask;

      const created = { ...task, id: 'new-id', status: 'draft', title: 'Yoga (Copy)' };
      delete created.createdAt;
      delete created.deletedAt;

      mockRepository.findOne.mockResolvedValue(task);
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      await service.duplicateTask('task-1', { dueDate: '2026-08-01' });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetProfile: { dueDate: '2026-08-01' },
        }),
      );
    });

    it('merges settings in targetProfile when provided', async () => {
      const task = {
        id: 'task-1',
        title: 'Meditate',
        status: 'draft',
        xlmReward: 3,
        targetProfile: { dueDate: '2026-07-01', settings: { reminder: true, repeat: 'daily' } },
        category: 'mental',
        isActive: true,
        createdAt: new Date(),
        deletedAt: null,
        reminderTime: null,
      } as unknown as HealthTask;

      const created = { ...task, id: 'new-id', status: 'draft', title: 'Meditate (Copy)' };
      delete created.createdAt;
      delete created.deletedAt;

      mockRepository.findOne.mockResolvedValue(task);
      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      await service.duplicateTask('task-1', { settings: { reminder: false } });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetProfile: {
            dueDate: '2026-07-01',
            settings: { reminder: false, repeat: 'daily' },
          },
        }),
      );
    });
  });

  describe('bulkDuplicate', () => {
    it('duplicates multiple tasks', async () => {
      const tasks = [
        { id: 't1', title: 'Task A', status: 'completed', xlmReward: 1, targetProfile: {}, category: 'fitness', isActive: true, createdAt: new Date(), deletedAt: null, reminderTime: null },
        { id: 't2', title: 'Task B', status: 'pending', xlmReward: 2, targetProfile: {}, category: 'nutrition', isActive: true, createdAt: new Date(), deletedAt: null, reminderTime: null },
      ] as unknown as HealthTask[];

      const created = tasks.map(t => ({
        ...t,
        id: undefined,
        status: 'draft',
        title: `${t.title} (Copy)`,
      }));

      mockRepository.find.mockResolvedValue(tasks);
      mockRepository.create.mockImplementation((data) => data as any);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.bulkDuplicate(['t1', 't2']);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Task A (Copy)');
      expect(result[1].title).toBe('Task B (Copy)');
      expect(result[0].status).toBe('draft');
    });
  });
});
