import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TasksScheduler } from '../tasks/tasks.scheduler';
import { RewardsScheduler } from '../rewards/rewards.scheduler';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class Mock {},
}));
jest.mock('../auth/guards/roles.guard', () => ({ RolesGuard: class Mock {} }));

describe('AdminController', () => {
  let controller: AdminController;

  const mockTasksScheduler = {
    assignDailyTasksManually: jest.fn(),
  };

  const mockRewardsScheduler = {
    resetDailyRewardsManually: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {},
        },
        {
          provide: TasksScheduler,
          useValue: mockTasksScheduler,
        },
        {
          provide: RewardsScheduler,
          useValue: mockRewardsScheduler,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should reset daily rewards manually', async () => {
    mockRewardsScheduler.resetDailyRewardsManually.mockResolvedValue({
      startedAt: '2026-03-30T00:00:00.000Z',
      completedAt: '2026-03-30T00:00:01.000Z',
      resetCount: 15,
      failedCount: 0,
      durationMs: 1000,
    });

    await expect(controller.resetDailyRewards()).resolves.toEqual({
      message: 'Daily rewards reset completed',
      startedAt: '2026-03-30T00:00:00.000Z',
      completedAt: '2026-03-30T00:00:01.000Z',
      resetCount: 15,
      failedCount: 0,
      durationMs: 1000,
    });
  });
});
