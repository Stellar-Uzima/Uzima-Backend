import { Test, TestingModule } from '@nestjs/testing';
import { HealthTasksService } from './health-tasks.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HealthTasksService', () => {
  let service: HealthTasksService;
  let prisma: PrismaService;

  const mockHealthTasks = [
    {
      id: '1',
      title: 'Morning Run',
      description: 'Run 5km',
      status: 'pending',
      priority: 'high',
      dueDate: new Date(),
      userId: 'user1',
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      title: 'Drink Water',
      description: 'Drink 2L water',
      status: 'completed',
      priority: 'medium',
      dueDate: new Date(),
      userId: 'user1',
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrismaService = {
    healthTask: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthTasksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<HealthTasksService>(HealthTasksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CRUD Operations', () => {
    describe('create', () => {
      it('should create a new health task', async () => {
        const createDto = {
          title: 'New Task',
          description: 'Task description',
          priority: 'high',
          dueDate: new Date(),
          userId: 'user1',
        };

        mockPrismaService.healthTask.create.mockResolvedValue({
          id: '3',
          ...createDto,
          status: 'pending',
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.create(createDto);

        expect(mockPrismaService.healthTask.create).toHaveBeenCalled();
        expect(result).toHaveProperty('id');
        expect(result.title).toBe(createDto.title);
      });

      it('should throw error when required fields are missing', async () => {
        const invalidDto = { title: 'Only Title' };
        mockPrismaService.healthTask.create.mockRejectedValue(new Error('Missing required fields'));

        await expect(service.create(invalidDto as any)).rejects.toThrow();
      });
    });

    describe('findAll', () => {
      it('should return all health tasks for a user', async () => {
        mockPrismaService.healthTask.findMany.mockResolvedValue(mockHealthTasks);

        const result = await service.findAll('user1');

        expect(mockPrismaService.healthTask.findMany).toHaveBeenCalled();
        expect(result).toHaveLength(2);
      });

      it('should return empty array when no tasks exist', async () => {
        mockPrismaService.healthTask.findMany.mockResolvedValue([]);

        const result = await service.findAll('user1');

        expect(result).toEqual([]);
      });
    });

    describe('findOne', () => {
      it('should return a single health task by id', async () => {
        mockPrismaService.healthTask.findUnique.mockResolvedValue(mockHealthTasks[0]);

        const result = await service.findOne('1', 'user1');

        expect(mockPrismaService.healthTask.findUnique).toHaveBeenCalled();
        expect(result.id).toBe('1');
      });

      it('should return null when task not found', async () => {
        mockPrismaService.healthTask.findUnique.mockResolvedValue(null);

        const result = await service.findOne('999', 'user1');

        expect(result).toBeNull();
      });
    });

    describe('update', () => {
      it('should update an existing health task', async () => {
        const updateDto = { title: 'Updated Title', priority: 'low' };
        const updatedTask = { ...mockHealthTasks[0], ...updateDto };

        mockPrismaService.healthTask.update.mockResolvedValue(updatedTask);

        const result = await service.update('1', updateDto);

        expect(mockPrismaService.healthTask.update).toHaveBeenCalled();
        expect(result.title).toBe('Updated Title');
        expect(result.priority).toBe('low');
      });

      it('should throw error when task not found', async () => {
        mockPrismaService.healthTask.update.mockRejectedValue(new Error('Task not found'));

        await expect(service.update('999', { title: 'New' })).rejects.toThrow();
      });
    });

    describe('delete', () => {
      it('should delete a health task', async () => {
        mockPrismaService.healthTask.delete.mockResolvedValue(mockHealthTasks[0]);

        const result = await service.delete('1');

        expect(mockPrismaService.healthTask.delete).toHaveBeenCalled();
        expect(result.id).toBe('1');
      });

      it('should throw error when deleting non-existent task', async () => {
        mockPrismaService.healthTask.delete.mockRejectedValue(new Error('Task not found'));

        await expect(service.delete('999')).rejects.toThrow();
      });
    });
  });

  describe('Filtering', () => {
    it('should filter tasks by status', async () => {
      const pendingTasks = mockHealthTasks.filter(t => t.status === 'pending');
      mockPrismaService.healthTask.findMany.mockResolvedValue(pendingTasks);

      const result = await service.findByStatus('user1', 'pending');

      expect(mockPrismaService.healthTask.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1', status: 'pending' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });

    it('should filter tasks by priority', async () => {
      const highPriorityTasks = mockHealthTasks.filter(t => t.priority === 'high');
      mockPrismaService.healthTask.findMany.mockResolvedValue(highPriorityTasks);

      const result = await service.findByPriority('user1', 'high');

      expect(mockPrismaService.healthTask.findMany).toHaveBeenCalled();
      expect(result[0].priority).toBe('high');
    });

    it('should filter tasks by date range', async () => {
      const startDate = new Date();
      const endDate = new Date();
      mockPrismaService.healthTask.findMany.mockResolvedValue(mockHealthTasks);

      const result = await service.findByDateRange('user1', startDate, endDate);

      expect(mockPrismaService.healthTask.findMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Sorting', () => {
    it('should sort tasks by due date ascending', async () => {
      const sortedTasks = [...mockHealthTasks].sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
      mockPrismaService.healthTask.findMany.mockResolvedValue(sortedTasks);

      const result = await service.findAllSorted('user1', 'dueDate', 'asc');

      expect(mockPrismaService.healthTask.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        orderBy: { dueDate: 'asc' },
      });
      expect(result).toBeDefined();
    });

    it('should sort tasks by priority descending', async () => {
      mockPrismaService.healthTask.findMany.mockResolvedValue(mockHealthTasks);

      const result = await service.findAllSorted('user1', 'priority', 'desc');

      expect(mockPrismaService.healthTask.findMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should sort tasks by creation date', async () => {
      mockPrismaService.healthTask.findMany.mockResolvedValue(mockHealthTasks);

      const result = await service.findAllSorted('user1', 'createdAt', 'desc');

      expect(mockPrismaService.healthTask.findMany).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Completion Tracking', () => {
    it('should mark a task as completed', async () => {
      const completedTask = { ...mockHealthTasks[0], status: 'completed', completedAt: new Date() };
      mockPrismaService.healthTask.update.mockResolvedValue(completedTask);

      const result = await service.markAsCompleted('1');

      expect(mockPrismaService.healthTask.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: 'completed', completedAt: expect.any(Date) },
      });
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('should mark a task as pending', async () => {
      const pendingTask = { ...mockHealthTasks[1], status: 'pending', completedAt: null };
      mockPrismaService.healthTask.update.mockResolvedValue(pendingTask);

      const result = await service.markAsPending('2');

      expect(mockPrismaService.healthTask.update).toHaveBeenCalledWith({
        where: { id: '2' },
        data: { status: 'pending', completedAt: null },
      });
      expect(result.status).toBe('pending');
      expect(result.completedAt).toBeNull();
    });

    it('should get completion statistics', async () => {
      mockPrismaService.healthTask.count.mockResolvedValueOnce(5); // total
      mockPrismaService.healthTask.count.mockResolvedValueOnce(3); // completed

      const stats = await service.getCompletionStats('user1');

      expect(mockPrismaService.healthTask.count).toHaveBeenCalledTimes(2);
      expect(stats.completionRate).toBe(60);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty userId', async () => {
      await expect(service.findAll('')).rejects.toThrow();
    });

    it('should handle large batch of tasks', async () => {
      const largeBatch = Array(100).fill(null).map((_, i) => ({
        id: String(i),
        title: `Task ${i}`,
        status: 'pending',
        priority: 'medium',
        userId: 'user1',
      }));
      mockPrismaService.healthTask.findMany.mockResolvedValue(largeBatch);

      const result = await service.findAll('user1');
      expect(result).toHaveLength(100);
    });

    it('should handle special characters in title', async () => {
      const specialTask = {
        title: 'Task with <script>alert("xss")</script>',
        description: 'Special chars: !@#$%^&*()',
        priority: 'low',
        userId: 'user1',
      };
      mockPrismaService.healthTask.create.mockResolvedValue({ id: 'special', ...specialTask });

      const result = await service.create(specialTask as any);
      expect(result.title).toBe(specialTask.title);
    });

    it('should handle future due dates', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const taskWithFutureDate = { ...mockHealthTasks[0], dueDate: futureDate };
      mockPrismaService.healthTask.findUnique.mockResolvedValue(taskWithFutureDate);

      const result = await service.findOne('1', 'user1');
      expect(new Date(result.dueDate).getFullYear()).toBeGreaterThan(new Date().getFullYear());
    });
  });
}); 