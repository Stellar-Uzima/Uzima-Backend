import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateHealthTaskDto,
  TaskCategory as CreateTaskCategory,
} from '../../common/dto/create-health-task.dto';
import { TaskCategory } from '../../database/entities/task-category.entity';
import { TaskTag } from '../../database/entities/task-tag.entity';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { ActivityLogService } from './services/activity-log.service';
import { PriorityService } from './services/priority.service';
import { HealthTasksService } from './health-tasks.service';

describe('HealthTasksService', () => {
  let service: HealthTasksService;
  let taskRepository: jest.Mocked<Partial<Repository<HealthTask>>>;
  let categoryRepository: jest.Mocked<Partial<Repository<TaskCategory>>>;
  let tagRepository: jest.Mocked<Partial<Repository<TaskTag>>>;

  beforeEach(async () => {
    taskRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    };
    categoryRepository = { findOne: jest.fn() };
    tagRepository = { findByIds: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthTasksService,
        { provide: getRepositoryToken(HealthTask), useValue: taskRepository },
        { provide: getRepositoryToken(TaskCategory), useValue: categoryRepository },
        { provide: getRepositoryToken(TaskTag), useValue: tagRepository },
        {
          provide: PriorityService,
          useValue: {
            resolvePriority: jest.fn(),
            buildOverdueAlert: jest.fn(),
            sortByPriority: jest.fn(),
          },
        },
        {
          provide: ActivityLogService,
          useValue: { logTaskChange: jest.fn(), getActivityHistory: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<HealthTasksService>(HealthTasksService);
  });

  it('creates a task using the TypeORM repository', async () => {
    const dto: CreateHealthTaskDto = {
      title: 'Drink water',
      category: CreateTaskCategory.HYDRATION,
      description: 'Drink enough water throughout the day',
    };
    const task = { id: 'task-1', title: dto.title };
    taskRepository.create!.mockReturnValue(task as HealthTask);
    taskRepository.save!.mockResolvedValue(task as HealthTask);

    await expect(service.create(dto)).resolves.toBe(task);

    expect(taskRepository.create).toHaveBeenCalledWith({
      title: dto.title,
      description: dto.description,
      dueDate: undefined,
      priority: undefined,
      frequency: undefined,
    });
    expect(taskRepository.save).toHaveBeenCalledWith(task);
  });

  it('loads one task with its category and tags', async () => {
    const task = { id: 'task-1' } as HealthTask;
    taskRepository.findOne!.mockResolvedValue(task);

    await expect(service.findOne('task-1')).resolves.toBe(task);

    expect(taskRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      relations: ['category', 'tags'],
    });
  });

});
