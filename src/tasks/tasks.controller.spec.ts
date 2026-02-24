import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { Role } from '../auth/enums/role.enum';
import { TaskStatus } from './enums/task-status.enum';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a task', async () => {
      const createTaskDto = {
        name: 'Test Task',
        description: 'Test Description',
        categoryId: 1,
        xlmReward: 1.5,
      };
      const req = { user: { userId: 1, role: Role.HEALER } };
      const expectedTask = { id: 1, ...createTaskDto, createdBy: 1, status: TaskStatus.DRAFT };

      mockTasksService.create.mockResolvedValue(expectedTask);

      const result = await controller.create(createTaskDto, req);

      expect(service.create).toHaveBeenCalledWith(createTaskDto, 1);
      expect(result).toEqual(expectedTask);
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const listTasksDto = { page: 1, limit: 20 };
      const expectedResult = {
        data: [{ id: 1, name: 'Task 1' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      mockTasksService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(listTasksDto);

      expect(service.findAll).toHaveBeenCalledWith(listTasksDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const expectedTask = { id: 1, name: 'Task 1' };
      mockTasksService.findOne.mockResolvedValue(expectedTask);

      const result = await controller.findOne('1');

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(expectedTask);
    });
  });

  describe('update', () => {
    it('should update a task', async () => {
      const updateTaskDto = { name: 'Updated Task' };
      const req = { user: { userId: 1, role: Role.HEALER } };
      const expectedTask = { id: 1, name: 'Updated Task' };

      mockTasksService.update.mockResolvedValue(expectedTask);

      const result = await controller.update('1', updateTaskDto, req);

      expect(service.update).toHaveBeenCalledWith(1, updateTaskDto, 1, Role.HEALER);
      expect(result).toEqual(expectedTask);
    });
  });

  describe('remove', () => {
    it('should remove a task', async () => {
      mockTasksService.remove.mockResolvedValue(undefined);

      const result = await controller.remove('1');

      expect(service.remove).toHaveBeenCalledWith(1);
      expect(result).toEqual({ message: 'Task archived successfully' });
    });
  });
});
