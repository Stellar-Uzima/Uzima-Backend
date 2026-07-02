import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TaskCategorySeeder } from './task-category.seeder';
import { TaskCategory } from '../../tasks/entities/task-category.entity';

describe('TaskCategorySeeder', () => {
  let seeder: TaskCategorySeeder;
  let dataSource: DataSource;

  const mockCategoryRepository = {
    count: jest.fn(),
    findOne: jest.fn().mockReturnThis(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(mockCategoryRepository),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCategorySeeder,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    seeder = module.get<TaskCategorySeeder>(TaskCategorySeeder);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(seeder).toBeDefined();
  });

  describe('getName', () => {
    it('should return the seeder name', () => {
      expect(seeder.getName()).toBe('TaskCategorySeeder');
    });
  });

  describe('exists', () => {
    it('should return true when categories exist', async () => {
      mockCategoryRepository.count.mockResolvedValue(5);
      const result = await seeder.exists();
      expect(result).toBe(true);
    });

    it('should return false when no categories exist', async () => {
      mockCategoryRepository.count.mockResolvedValue(0);
      const result = await seeder.exists();
      expect(result).toBe(false);
    });
  });

  describe('run', () => {
    it('should create categories that do not already exist', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null); // No existing categories
      mockCategoryRepository.create.mockReturnValue({});
      mockCategoryRepository.count.mockResolvedValue(7);

      await seeder.run();

      expect(mockCategoryRepository.create).toHaveBeenCalled();
      expect(mockCategoryRepository.save).toHaveBeenCalled();
    });

    it('should skip existing categories (idempotent)', async () => {
      const existingCategory = { name: 'Nutrition' };
      mockCategoryRepository.findOne.mockResolvedValue(existingCategory);
      mockCategoryRepository.count.mockResolvedValue(1);

      await seeder.run();

      expect(mockCategoryRepository.create).not.toHaveBeenCalled();
      expect(mockCategoryRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('seed (base class method)', () => {
    it('should skip seeding when data already exists', async () => {
      mockCategoryRepository.count.mockResolvedValue(1);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await seeder.seed();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Data already exists, skipping'),
      );
      consoleSpy.mockRestore();
    });

    it('should log success when seeding completes', async () => {
      mockCategoryRepository.count.mockResolvedValue(0);
      mockCategoryRepository.findOne.mockResolvedValue(null);
      mockCategoryRepository.create.mockReturnValue({});

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await seeder.seed();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Completed successfully'),
      );
      consoleSpy.mockRestore();
    });
  });
});