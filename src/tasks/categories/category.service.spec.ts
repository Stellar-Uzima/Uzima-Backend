import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { TaskCategory } from '../entities/task-category.entity';

const mockRepository = {
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(TaskCategory),
          useValue: mockRepository,
        },
        {
          provide: 'REDIS',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return results from cache when search is not provided', async () => {
    const cachedCategories = [
      { id: '1', name: 'Nutrition', nameTranslations: {}, icon: 'foo', color: '#fff' },
    ];

    mockRedis.get.mockResolvedValue(JSON.stringify(cachedCategories));

    const result = await service.findAll();

    expect(mockRedis.get).toHaveBeenCalledWith('task_categories');
    expect(result).toEqual(cachedCategories);
    expect(mockRepository.find).not.toHaveBeenCalled();
  });

  it('should return filtered categories when search query is provided', async () => {
    const queryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: '1', name: 'Nutrition', nameTranslations: {}, icon: 'foo', color: '#fff' },
      ]),
    };

    mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll('nutrition');

    expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('category');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(category.name ILIKE :term OR category.nameTranslations::text ILIKE :term)',
      { term: '%nutrition%' },
    );
    expect(result).toEqual([
      { id: '1', name: 'Nutrition', nameTranslations: {}, icon: 'foo', color: '#fff' },
    ]);
  });

  it('should return empty array when no categories match search', async () => {
    const queryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll('doesnotexist');

    expect(result).toEqual([]);
  });
});
