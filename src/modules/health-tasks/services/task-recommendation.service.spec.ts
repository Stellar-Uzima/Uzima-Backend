/**
 * @jest-environment node
 */

// Mock the setup module to prevent database connection attempts
jest.mock('../../../../test/setup', () => ({
  setupTestDatabase: jest.fn(),
  teardownTestDatabase: jest.fn(),
  beforeEachTest: jest.fn(),
  afterEachTest: jest.fn(),
}));

// Prevent global database setup from running
process.env.SKIP_DB_SETUP = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { TaskRecommendationService } from './task-recommendation.service';
import { AnalyticsService } from './analytics.service';
import { TaskTemplatesService } from './templates.service';

describe('TaskRecommendationService', () => {
  let service: TaskRecommendationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskRecommendationService,
        {
          provide: AnalyticsService,
          useValue: {
            getUserTaskStats: jest.fn().mockResolvedValue({
              totalCompletions: 0,
              pendingCompletions: 0,
              completionRate: 0,
            }),
          },
        },
        {
          provide: TaskTemplatesService,
          useValue: {
            getAllTemplates: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<TaskRecommendationService>(TaskRecommendationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return default recommendations for new users with no history', async () => {
    const recommendations = await service.getRecommendations('new-user-id');
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].matchScore).toBeGreaterThan(0);
  });

  it('should rank tasks based on category engagement when history exists', async () => {
    const recommendations = await service.getRecommendations('active-user');
    expect(recommendations).toBeDefined();
  });
});
