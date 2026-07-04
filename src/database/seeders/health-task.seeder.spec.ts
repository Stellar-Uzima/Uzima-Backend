import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthTaskSeeder } from './health-task.seeder';
import { HealthTask } from '../../tasks/entities/health-task.entity';

describe('HealthTaskSeeder', () => {
  let seeder: HealthTaskSeeder;
  let dataSource: DataSource;

  const mockHealthTaskRepository = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(mockHealthTaskRepository),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthTaskSeeder,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    seeder = module.get<HealthTaskSeeder>(HealthTaskSeeder);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(seeder).toBeDefined();
  });

  describe('getName', () => {
    it('should return the seeder name', () => {
      expect(seeder.getName()).toBe('HealthTaskSeeder');
    });
  });

  describe('exists', () => {
    it('should return true when health tasks exist', async () => {
      mockHealthTaskRepository.count.mockResolvedValue(5);
      const result = await seeder.exists();
      expect(result).toBe(true);
    });

    it('should return false when no health tasks exist', async () => {
      mockHealthTaskRepository.count.mockResolvedValue(0);
      const result = await seeder.exists();
      expect(result).toBe(false);
    });
  });

  describe('run', () => {
    it('should create health tasks that do not already exist', async () => {
      mockHealthTaskRepository.findOne.mockResolvedValue(null);
      mockHealthTaskRepository.create.mockReturnValue({});
      mockHealthTaskRepository.count.mockResolvedValue(13);

      await seeder.run();

      expect(mockHealthTaskRepository.create).toHaveBeenCalled();
      expect(mockHealthTaskRepository.save).toHaveBeenCalled();
    });

    it('should skip existing health tasks (idempotent)', async () => {
      const existingTask = { title: 'Walk 10,000 steps' };
      mockHealthTaskRepository.findOne.mockResolvedValue(existingTask);
      mockHealthTaskRepository.count.mockResolvedValue(1);

      await seeder.run();

      expect(mockHealthTaskRepository.create).not.toHaveBeenCalled();
      expect(mockHealthTaskRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('seed (base class method)', () => {
    it('should skip seeding when data already exists', async () => {
      mockHealthTaskRepository.count.mockResolvedValue(1);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await seeder.seed();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Data already exists, skipping'),
      );
      consoleSpy.mockRestore();
    });

    it('should log success when seeding completes', async () => {
      mockHealthTaskRepository.count.mockResolvedValue(0);
      mockHealthTaskRepository.findOne.mockResolvedValue(null);
      mockHealthTaskRepository.create.mockReturnValue({});

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await seeder.seed();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Completed successfully'),
      );
      consoleSpy.mockRestore();
    });
  });
});