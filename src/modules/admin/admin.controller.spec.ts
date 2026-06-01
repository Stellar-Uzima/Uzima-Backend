import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { TasksScheduler } from '@/tasks/tasks.scheduler';
import { RewardsScheduler } from '@/rewards/rewards.scheduler';
import { CacheService } from '@/shared/cache/cache.service';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<Partial<AdminService>>;
  let cacheService: jest.Mocked<Partial<CacheService>>;

  beforeEach(async () => {
    adminService = {
      getDashboardStats: jest.fn().mockResolvedValue({
        totalUsers: 100,
        activeUsers: 50,
        totalTasks: 200,
        completedTasks: 150,
        totalRewardsDistributed: 1000,
      }),
    };

    cacheService = {
      remember: jest.fn().mockImplementation((key, fn, ttl) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: TasksScheduler, useValue: {} },
        { provide: RewardsScheduler, useValue: {} },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStats', () => {
    it('should return dashboard stats and use cache', async () => {
      const result = await controller.getStats();
      
      expect(cacheService.remember).toHaveBeenCalledWith(
        'admin_dashboard_stats',
        expect.any(Function),
        300
      );
      
      expect(adminService.getDashboardStats).toHaveBeenCalled();
      
      expect(result).toEqual({
        totalUsers: 100,
        activeUsers: 50,
        totalTasks: 200,
        completedTasks: 150,
        totalRewardsDistributed: 1000,
      });
    });
  });
});
