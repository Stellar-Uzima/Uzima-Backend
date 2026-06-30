import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaskDependenciesService } from './dependencies.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

const mockTaskRepo = {
  findOne: jest.fn(),
};

const makeTask = (id: string, status = 'pending'): Partial<HealthTask> => ({
  id,
  status: status as any,
});

describe('TaskDependenciesService', () => {
  let service: TaskDependenciesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskDependenciesService,
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockTaskRepo,
        },
      ],
    }).compile();

    service = module.get<TaskDependenciesService>(TaskDependenciesService);
    jest.clearAllMocks();
    // Reset internal in-memory state
    (service as any).dependencies = [];
    (service as any).counter = 0;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── addDependency ──────────────────────────────────────────────────────────

  describe('addDependency', () => {
    it('should add a valid dependency and return the record', async () => {
      mockTaskRepo.findOne
        .mockResolvedValueOnce(makeTask('task-a'))
        .mockResolvedValueOnce(makeTask('task-b'));

      const result = await service.addDependency('task-a', 'task-b');

      expect(result).toMatchObject({ taskId: 'task-a', dependsOnTaskId: 'task-b' });
      expect(result.id).toMatch(/^dep_/);
    });

    it('should throw BadRequestException when task depends on itself', async () => {
      await expect(service.addDependency('task-a', 'task-a')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when taskId does not exist', async () => {
      mockTaskRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeTask('task-b'));

      await expect(service.addDependency('missing', 'task-b')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when dependsOnTaskId does not exist', async () => {
      mockTaskRepo.findOne
        .mockResolvedValueOnce(makeTask('task-a'))
        .mockResolvedValueOnce(null);

      await expect(service.addDependency('task-a', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return existing record without duplicate if dependency already added', async () => {
      mockTaskRepo.findOne
        .mockResolvedValue(makeTask('task-a'))
        .mockResolvedValue(makeTask('task-b'));

      mockTaskRepo.findOne
        .mockResolvedValueOnce(makeTask('task-a'))
        .mockResolvedValueOnce(makeTask('task-b'))
        .mockResolvedValueOnce(makeTask('task-a'))
        .mockResolvedValueOnce(makeTask('task-b'));

      const first = await service.addDependency('task-a', 'task-b');
      const second = await service.addDependency('task-a', 'task-b');

      expect(first).toBe(second);
      expect((service as any).dependencies).toHaveLength(1);
    });

    it('should reject a direct circular dependency (A->B then B->A)', async () => {
      mockTaskRepo.findOne
        .mockResolvedValueOnce(makeTask('task-a'))
        .mockResolvedValueOnce(makeTask('task-b'))
        .mockResolvedValueOnce(makeTask('task-b'))
        .mockResolvedValueOnce(makeTask('task-a'));

      await service.addDependency('task-a', 'task-b');

      await expect(service.addDependency('task-b', 'task-a')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject an indirect circular dependency (A->B->C then C->A)', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));

      await service.addDependency('task-a', 'task-b');
      await service.addDependency('task-b', 'task-c');

      await expect(service.addDependency('task-c', 'task-a')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── removeDependency ───────────────────────────────────────────────────────

  describe('removeDependency', () => {
    it('should remove an existing dependency and return true', async () => {
      mockTaskRepo.findOne
        .mockResolvedValueOnce(makeTask('task-a'))
        .mockResolvedValueOnce(makeTask('task-b'));

      await service.addDependency('task-a', 'task-b');
      const removed = service.removeDependency('task-a', 'task-b');

      expect(removed).toBe(true);
      expect((service as any).dependencies).toHaveLength(0);
    });

    it('should return false when dependency does not exist', () => {
      const removed = service.removeDependency('task-a', 'task-b');
      expect(removed).toBe(false);
    });
  });

  // ── getDependencies / getDependents ────────────────────────────────────────

  describe('getDependencies', () => {
    it('should return all dependencies for a task', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));

      await service.addDependency('task-a', 'task-b');
      await service.addDependency('task-a', 'task-c');

      const deps = service.getDependencies('task-a');
      expect(deps).toHaveLength(2);
    });

    it('should return empty array when no dependencies exist', () => {
      expect(service.getDependencies('task-a')).toEqual([]);
    });
  });

  describe('getDependents', () => {
    it('should return tasks that depend on the given task', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));

      await service.addDependency('task-b', 'task-a');
      await service.addDependency('task-c', 'task-a');

      const dependents = service.getDependents('task-a');
      expect(dependents).toHaveLength(2);
      expect(dependents.map((d) => d.taskId)).toEqual(
        expect.arrayContaining(['task-b', 'task-c']),
      );
    });
  });

  // ── canStart ───────────────────────────────────────────────────────────────

  describe('canStart', () => {
    it('should allow start when task has no dependencies', async () => {
      const result = await service.canStart('task-a');
      expect(result).toEqual({ allowed: true, blockedBy: [] });
    });

    it('should allow start when all dependencies are completed', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));
      await service.addDependency('task-a', 'task-b');

      mockTaskRepo.findOne.mockResolvedValueOnce(makeTask('task-b', 'completed'));

      const result = await service.canStart('task-a');
      expect(result).toEqual({ allowed: true, blockedBy: [] });
    });

    it('should block start when a dependency is not completed', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));
      await service.addDependency('task-a', 'task-b');

      mockTaskRepo.findOne.mockResolvedValueOnce(makeTask('task-b', 'pending'));

      const result = await service.canStart('task-a');
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('task-b');
    });

    it('should block start when dependency task is not found', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));
      await service.addDependency('task-a', 'task-b');

      mockTaskRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.canStart('task-a');
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toContain('task-b');
    });
  });

  // ── onTaskCompleted ────────────────────────────────────────────────────────

  describe('onTaskCompleted', () => {
    it('should return tasks unlocked when a task is completed', async () => {
      mockTaskRepo.findOne.mockResolvedValue(makeTask('any'));
      await service.addDependency('task-b', 'task-a');

      // canStart check: task-a is completed
      mockTaskRepo.findOne.mockResolvedValueOnce(makeTask('task-a', 'completed'));

      const unlocked = await service.onTaskCompleted('task-a');
      expect(unlocked).toContain('task-b');
    });

    it('should return empty array when no tasks are unblocked', async () => {
      const unlocked = await service.onTaskCompleted('task-x');
      expect(unlocked).toEqual([]);
    });
  });
});
